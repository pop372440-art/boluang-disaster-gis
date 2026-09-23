'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import 'leaflet/dist/leaflet.css';
import { useMapEvents, useMap } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';
import { evaluateFreshness } from '@/lib/radar/data-freshness';
import { validateAndNormalizeVillageGeoJson, validatePolygonFeatureCollection } from '@/lib/radar/geojson-validation';
import { parseForecastApiResponse } from '@/lib/radar/open-meteo-adapter';
import { parseOpenMeteoOutlookApiResponse } from '@/lib/radar/open-meteo-outlook-adapter';
import { parseRainViewerMetadata } from '@/lib/radar/rainviewer-adapter';
import { getRiskLevelDefinition, RISK_CONFIG, RISK_LEVELS } from '@/lib/radar/threshold-config';
import type { DataSourceStatus, RadarFrame, RadarMetadata } from '@/lib/radar/types';
import type { AlertState } from '@/lib/radar/alert-state-machine';
import { compareRainForecasts } from '@/lib/radar/forecast-model-comparison';
import {
  parseMetNorwayApiResponse,
  sumMetNorwayRain3h,
  aggregateMetNorwayDailyRain,
} from '@/lib/radar/met-norway-adapter';
import { buildLongRangeOutlook } from '@/lib/radar/long-range-outlook';
import {
  clampAnimationFrameMs,
  selectEffectiveRadarQuality,
} from '@/lib/radar/radar-render-policy';
import {
  aggregateVillageForecasts,
  chunkItems,
  createVillageSamplePlans,
  flattenSamplePlans,
} from '@/lib/radar/village-forecast';
import {
  detectRadarQuality,
  isRadarTileBlocked,
  pruneRadarFrameCache,
} from '@/components/radar/radarClientCache';

/* ═══════════════════════════ SUPABASE ═══════════════════════════ */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((m) => m.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const SmoothRadar = dynamic(() => import('@/components/radar/SmoothRadar'), { ssr: false });

/* ═══════════════════════════ CONFIG ═══════════════════════════ */
const TZ = 'Asia/Bangkok';
const RV_SCHEME_DEFAULT = 4;
type Quality = import('@/components/radar/radarClientCache').RadarQuality;

const toDate = (value: Date | number | null | undefined) =>
  value == null ? null : typeof value === 'number' ? new Date(value) : value;
const fmtTime = (value: Date | number | null | undefined) => {
  const date = toDate(value);
  return date ? date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '--:--';
};
const fmtDate = (value: Date | number | null | undefined) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) : '-';
};
/* ═══════════════════════ BASEMAPS ═══════════════════════ */
const BASEMAPS = {
  light: { name: 'Light', swatch: 'bg-[#E5E7EB]', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', subdomains: 'abcd', maxNativeZoom: 20, attr: '&copy; OSM &copy; CARTO', labels: '' },
  terrain: { name: 'Terrain', swatch: 'bg-[#8F9779]', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', subdomains: '', maxNativeZoom: 19, attr: 'Tiles &copy; Esri', labels: '' },
  satellite: { name: 'Satellite', swatch: 'bg-[#2D4C1E]', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', subdomains: '', maxNativeZoom: 19, attr: 'Tiles &copy; Esri, Maxar', labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' },
  dark: { name: 'Dark', swatch: 'bg-[#111319]', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', maxNativeZoom: 20, attr: '&copy; OSM &copy; CARTO', labels: '' },
} as const;
type BasemapId = keyof typeof BASEMAPS;

/* ═══════════════════════ GEO HELPERS ═══════════════════════ */
const ringsOf = (g: any): number[][][] =>
  !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];

const pointInPolygon = (lng: number, lat: number, g: any) => {
  let inside = false;
  for (const ring of ringsOf(g))
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
};

const NAME_KEYS = ['name_th', 'NAME_TH', 'village', 'VILLAGE', 'name', 'NAME', 'ban', 'BAN', 'vill_name', 'Name', 'title', 'zone', 'ZONE'];
const MOO_KEYS = ['moo', 'MOO', 'Moo', 'mu', 'MU', 'village_no', 'VILLAGE_NO', 'no', 'NO', 'id', 'ID', 'block', 'BLOCK', 'gid'];
const getMoo = (p: any = {}, i = 0) => {
  for (const k of MOO_KEYS) if (p?.[k] != null && `${p[k]}`.trim() !== '') return `${p[k]}`.replace(/[^0-9]/g, '') || `${i + 1}`;
  return `${i + 1}`;
};
const getName = (p: any = {}, i = 0) => {
  for (const k of NAME_KEYS) if (p?.[k] && `${p[k]}`.trim() !== '') return `${p[k]}`;
  return `หมู่ ${getMoo(p, i)}`;
};
const getIdx = (f: any) => (f?.properties?.__idx ?? 0) as number;

/* ═══════════════════ เกณฑ์เตือนภัย ═══════════════════ */
const LEVELS = RISK_LEVELS.filter((level) => level.key !== 'unknown').map((level) => ({
  ...level,
  act: level.recommendedActions[0],
}));

const RAIN_BANDS = [
  { label: 'ฝนหนักมาก', dbz: '≥ 55', c: '#A800A8' },
  { label: 'ฝนหนัก', dbz: '44 – 55', c: '#E81010' },
  { label: 'ฝนปานกลาง', dbz: '31 – 44', c: '#FFD700' },
  { label: 'ฝนเล็กน้อย', dbz: '15 – 31', c: '#00C400' },
];
const SCHEMES = [
  { v: 2, t: 'Universal Blue' }, { v: 3, t: 'TITAN' }, { v: 4, t: 'Weather Channel' },
  { v: 6, t: 'NEXRAD III' }, { v: 7, t: 'Rainbow' }, { v: 8, t: 'Dark Sky' },
];

const ClickableMap = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
};

const MapRefBinder = ({ mapRef }: { mapRef: React.MutableRefObject<any> }) => {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => { mapRef.current = null; };
  }, [map, mapRef]);
  return null;
};

const initialSourceStatus = (source: string): DataSourceStatus => ({
  state: 'idle',
  source,
  timestamp: null,
  freshness: null,
  error: null,
});

/* ═══════════════════════════ PAGE ═══════════════════════════ */
export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoLandslide, setGeoLandslide] = useState<any>(null);
  const [radarData, setRadarData] = useState<RadarMetadata | null>(null);
  const [radarStatus, setRadarStatus] = useState<DataSourceStatus>(() => initialSourceStatus('RainViewer'));
  const [forecastStatus, setForecastStatus] = useState<DataSourceStatus>(() => initialSourceStatus('Open-Meteo'));
  const [metNorwayStatus, setMetNorwayStatus] = useState<DataSourceStatus>(() => initialSourceStatus('MET Norway'));
  const [outlookStatus, setOutlookStatus] = useState<DataSourceStatus>(() => initialSourceStatus('แนวโน้ม 7–9 วัน'));
  const [geoJsonStatus, setGeoJsonStatus] = useState<DataSourceStatus>(() => initialSourceStatus('GeoJSON เทศบาลตำบลบ่อหลวง'));

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);        // เริ่มแบบหยุด กันยิง tile รัวตอนเปิดหน้า
  const [speed, setSpeed] = useState(1100);
  const [blockedNow, setBlockedNow] = useState(false);

  const [mapStyle, setMapStyle] = useState<BasemapId>('satellite');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.72);
  const [radarQuality, setRadarQuality] = useState<Quality>('bilinear');
  const [radarGain, setRadarGain] = useState(1);
  const [colorScheme, setColorScheme] = useState(RV_SCHEME_DEFAULT);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLandslide, setShowLandslide] = useState(false);
  const [landslideStatus, setLandslideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [reloadToken, setReloadToken] = useState(0);
  const [healthStatus, setHealthStatus] = useState<{ status: 'ok' | 'degraded' | 'loading'; checks?: Record<string, { status: string }> }>({ status: 'loading' });

  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(true);
  const [isTablePanelOpen, setIsTablePanelOpen] = useState(true);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [scope, setScope] = useState<'village' | 'tambon'>('village');

  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [forecastData, setForecastData] = useState<any>(null);
  const [isFetchingForecast, setIsFetchingForecast] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<any>(null);

  const [villageRisk, setVillageRisk] = useState<any[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskUpdatedAt, setRiskUpdatedAt] = useState<Date | null>(null);
  const [dismissedSig, setDismissedSig] = useState('');

  const [isTopHeaderVisible, setIsTopHeaderVisible] = useState(true);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [realStats, setRealStats] = useState({ totalVisits: 0, totalUniqueVisitors: 0, todayVisits: 0, todayUniqueVisitors: 0, isLoading: true });

  const mapRef = useRef<any>(null);
  const fcAbortRef = useRef<AbortController | null>(null);
  const riskAbortRef = useRef<AbortController | null>(null);
  const radarAbortRef = useRef<AbortController | null>(null);
  const alertStatesRef = useRef(new Map<string, AlertState>());
  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => { setRadarQuality(detectRadarQuality()); }, []);
  const effectiveRadarQuality = selectEffectiveRadarQuality(radarQuality, isPlaying);

  /* เฝ้าสถานะ rate-limit */
  useEffect(() => {
    const t = setInterval(() => setBlockedNow(isRadarTileBlocked()), 1000);
    return () => clearInterval(t);
  }, []);

  /* หยุดเล่นอัตโนมัติเมื่อโดนจำกัด */
  useEffect(() => { if (blockedNow && isPlaying) setIsPlaying(false); }, [blockedNow, isPlaying]);

  /* โหลด GeoJSON + รายการเฟรมเรดาร์ */
  useEffect(() => {
    const geoAbort = new AbortController();
    setGeoJsonStatus((previous) => ({ ...previous, state: 'loading', error: null }));
    Promise.all([
      fetch('/geojson/boluang.json', { signal: geoAbort.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`ขอบเขตตำบล HTTP ${response.status}`);
        return validatePolygonFeatureCollection(await response.json());
      }),
      fetch('/geojson/block.json', { signal: geoAbort.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`ขอบเขตหมู่บ้าน HTTP ${response.status}`);
        return validateAndNormalizeVillageGeoJson(await response.json());
      }),
    ]).then(([tambon, villages]) => {
      if (geoAbort.signal.aborted) return;
      const timestamp = new Date().toISOString();
      setGeoBoluang(tambon);
      setGeoBlock(villages);
      setGeoJsonStatus({ state: 'fresh', source: 'GeoJSON เทศบาลตำบลบ่อหลวง', timestamp, freshness: null, error: null });
    }).catch((error: unknown) => {
      if (geoAbort.signal.aborted) return;
      setGeoJsonStatus((previous) => ({
        ...previous,
        state: 'error',
        error: error instanceof Error ? error.message : 'โหลด GeoJSON ไม่สำเร็จ',
      }));
    });

    const loadRadar = async () => {
      radarAbortRef.current?.abort();
      const controller = new AbortController();
      radarAbortRef.current = controller;
      setRadarStatus((previous) => ({ ...previous, state: 'loading', error: null }));
      try {
        const response = await fetch('/api/radar/frames', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Radar metadata HTTP ${response.status}`);
        const metadata = parseRainViewerMetadata(await response.json());
        const latestObserved = metadata.observedFrames[metadata.observedFrames.length - 1];
        const freshness = evaluateFreshness(latestObserved.time * 1000, {
          staleAfterMinutes: RISK_CONFIG.freshness.radarStaleAfterMinutes,
          expireAfterMinutes: RISK_CONFIG.freshness.radarExpireAfterMinutes,
        });
        if (controller.signal.aborted) return;
        pruneRadarFrameCache(metadata.frames.map((frame) => frame.path));
        setRadarData(metadata);
        setRadarStatus({
          state: freshness.status === 'fresh' ? 'fresh' : 'stale',
          source: metadata.source,
          timestamp: freshness.observedAt,
          freshness,
          error: null,
        });
        setCurrentFrameIndex((previous) => (
          previous === 0 ? metadata.pastCount - 1 : Math.min(previous, metadata.frames.length - 1)
        ));
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setRadarStatus((previous) => ({
          ...previous,
          state: 'error',
          error: error instanceof Error ? error.message : 'โหลดข้อมูลเรดาร์ไม่สำเร็จ',
        }));
      }
    };

    void loadRadar();
    const timer = setInterval(() => { void loadRadar(); }, 5 * 60 * 1000);
    return () => {
      clearInterval(timer);
      geoAbort.abort();
      radarAbortRef.current?.abort();
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!showLandslide || geoLandslide) return;
    const controller = new AbortController();
    setLandslideStatus('loading');
    fetch('/geojson/boluang_landslide_risk.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`พื้นที่เสี่ยงดินถล่ม HTTP ${response.status}`);
        return validatePolygonFeatureCollection(await response.json());
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setGeoLandslide(data);
        setLandslideStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setLandslideStatus('error');
      });
    return () => controller.abort();
  }, [geoLandslide, showLandslide]);

  useEffect(() => {
    const controller = new AbortController();
    const loadHealth = async () => {
      try {
        const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
        const payload = await response.json();
        if (!controller.signal.aborted) setHealthStatus({ status: payload.status === 'ok' ? 'ok' : 'degraded', checks: payload.checks });
      } catch {
        if (!controller.signal.aborted) setHealthStatus({ status: 'degraded' });
      }
    };
    void loadHealth();
    const timer = window.setInterval(loadHealth, 2 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [reloadToken]);

  /* ความเสี่ยงรายหมู่บ้าน: 3–5 sample points / polygon, batch, p90 */
  const computeVillageRisk = useCallback(async (fc: any) => {
    const features = fc?.features || [];
    if (!features.length) return;
    riskAbortRef.current?.abort();
    const controller = new AbortController();
    riskAbortRef.current = controller;
    setRiskLoading(true);
    setForecastStatus((previous) => ({ ...previous, state: 'loading', error: null }));
    setMetNorwayStatus((previous) => ({ ...previous, state: 'loading', error: null }));
    setOutlookStatus((previous) => ({ ...previous, state: 'loading', error: null }));
    try {
      const plans = createVillageSamplePlans(features);
      if (plans.some((plan) => plan.points.length < RISK_CONFIG.villageSampling.minPoints)) {
        throw new Error('ไม่สามารถสร้างจุดตัวแทนอย่างน้อย 3 จุดให้ครบทุกหมู่บ้าน');
      }
      const samples = flattenSamplePlans(plans);
      const batches = chunkItems(samples, 25);
      const representativePoints = plans.map((plan) => plan.points[0]);
      const metNorwayResultPromise = (async () => {
        const latitude = representativePoints.map((point) => point[1].toFixed(5)).join(',');
        const longitude = representativePoints.map((point) => point[0].toFixed(5)).join(',');
        const response = await fetch(`/api/forecast/met-norway?latitude=${latitude}&longitude=${longitude}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`MET Norway HTTP ${response.status}`);
        return parseMetNorwayApiResponse(await response.json());
      })().then((data) => ({ data, error: null as Error | null }))
        .catch((error: unknown) => ({
          data: null,
          error: error instanceof Error ? error : new Error('MET Norway response ไม่ถูกต้อง'),
        }));
      const outlookResultPromise = (async () => {
        const latitude = representativePoints.map((point) => point[1].toFixed(4)).join(',');
        const longitude = representativePoints.map((point) => point[0].toFixed(4)).join(',');
        const response = await fetch(`/api/forecast/outlook?latitude=${latitude}&longitude=${longitude}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Outlook HTTP ${response.status}`);
        return parseOpenMeteoOutlookApiResponse(await response.json());
      })().then((data) => ({ data, error: null as Error | null }))
        .catch((error: unknown) => ({
          data: null,
          error: error instanceof Error ? error : new Error('ข้อมูลแนวโน้มไม่ถูกต้อง'),
        }));
      const forecasts = await Promise.all(batches.map(async (batch) => {
        const latitude = batch.map((point) => point.latitude.toFixed(5)).join(',');
        const longitude = batch.map((point) => point.longitude.toFixed(5)).join(',');
        const response = await fetch(`/api/forecast?latitude=${latitude}&longitude=${longitude}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
        return parseForecastApiResponse(await response.json());
      }));
      const fetchedAt = new Date(Math.min(...forecasts.map((forecast) => Date.parse(forecast.fetchedAt)))).toISOString();
      const freshness = evaluateFreshness(fetchedAt, {
        staleAfterMinutes: RISK_CONFIG.freshness.forecastStaleAfterMinutes,
        expireAfterMinutes: RISK_CONFIG.freshness.forecastExpireAfterMinutes,
      });
      let rows = aggregateVillageForecasts({
        features,
        plans,
        locations: forecasts.flatMap((forecast) => forecast.locations),
        freshness,
        fetchedAt,
        previousAlerts: alertStatesRef.current,
      }).map((row) => ({ ...row, peak: fmtTime(row.peakTime) }));
      const [metNorwayResult, outlookResult] = await Promise.all([metNorwayResultPromise, outlookResultPromise]);
      if (controller.signal.aborted) return;
      if (metNorwayResult.data) {
        const metFreshness = evaluateFreshness(metNorwayResult.data.fetchedAt, {
          staleAfterMinutes: RISK_CONFIG.freshness.metNorwayStaleAfterMinutes,
          expireAfterMinutes: RISK_CONFIG.freshness.metNorwayExpireAfterMinutes,
        });
        rows = rows.map((row, index) => ({
          ...row,
          forecastComparison: compareRainForecasts(
            row.rain3h,
            sumMetNorwayRain3h(metNorwayResult.data?.locations[index]),
            RISK_CONFIG.forecastAgreement,
          ),
          metNorwayFetchedAt: metNorwayResult.data?.fetchedAt,
        }));
        setMetNorwayStatus({
          state: metFreshness.status === 'fresh' ? 'fresh' : 'stale',
          source: 'MET Norway',
          timestamp: metNorwayResult.data.fetchedAt,
          freshness: metFreshness,
          error: null,
        });
      } else {
        setMetNorwayStatus((previous) => ({
          ...previous,
          state: 'error',
          error: metNorwayResult.error?.message ?? 'MET Norway ไม่พร้อมใช้งาน',
        }));
      }
      if (outlookResult.data) {
        const outlookFreshness = evaluateFreshness(outlookResult.data.fetchedAt, {
          staleAfterMinutes: RISK_CONFIG.freshness.outlookStaleAfterMinutes,
          expireAfterMinutes: RISK_CONFIG.freshness.outlookExpireAfterMinutes,
        });
        const metOutlookFreshness = evaluateFreshness(metNorwayResult.data?.fetchedAt ?? null, {
          staleAfterMinutes: RISK_CONFIG.freshness.metNorwayStaleAfterMinutes,
          expireAfterMinutes: RISK_CONFIG.freshness.metNorwayExpireAfterMinutes,
        });
        const outlookUsable = outlookFreshness.status !== 'expired' && outlookFreshness.status !== 'unknown';
        const metOutlookUsable = metOutlookFreshness.status !== 'expired' && metOutlookFreshness.status !== 'unknown';
        rows = rows.map((row, index) => {
          const primary = outlookResult.data?.locations[index];
          const reference = aggregateMetNorwayDailyRain(metOutlookUsable ? metNorwayResult.data?.locations[index] : undefined);
          const baseDate = primary?.days[0]?.date;
          return {
            ...row,
            longRangeOutlook: outlookUsable && baseDate ? buildLongRangeOutlook(
              baseDate,
              (primary?.days ?? []).map((day) => ({
                date: day.date,
                primaryRainMm: day.precipitationMm,
                referenceRainMm: reference.get(day.date) ?? null,
                precipitationProbabilityPct: day.precipitationProbabilityPct,
                temperatureMinC: day.temperatureMinC,
                temperatureMaxC: day.temperatureMaxC,
                windGustMaxKmh: day.windGustMaxKmh,
              })),
              RISK_CONFIG.longRangeOutlook,
            ) : [],
          };
        });
        setOutlookStatus({
          state: outlookFreshness.status === 'fresh' ? 'fresh' : 'stale',
          source: 'Open-Meteo + MET Norway (planning outlook)',
          timestamp: outlookResult.data.fetchedAt,
          freshness: outlookFreshness,
          error: outlookUsable ? null : 'ข้อมูลแนวโน้มหมดอายุและถูกระงับการแสดงผล',
        });
      } else {
        setOutlookStatus((previous) => ({
          ...previous,
          state: 'error',
          error: outlookResult.error?.message ?? 'แนวโน้ม 7–9 วันไม่พร้อมใช้งาน',
        }));
      }
      if (controller.signal.aborted) return;
      alertStatesRef.current = new Map(rows.map((row) => [row.id, row.alertState]));
      setVillageRisk(rows);
      setRiskUpdatedAt(new Date(fetchedAt));
      setForecastStatus({
        state: freshness.status === 'fresh' ? 'fresh' : 'stale',
        source: 'Open-Meteo',
        timestamp: fetchedAt,
        freshness,
        error: null,
      });
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setMetNorwayStatus((previous) => previous.state === 'loading' ? {
        ...previous,
        state: 'error',
        error: 'ยกเลิกการตรวจสอบไขว้เพราะข้อมูลพยากรณ์หลักไม่พร้อม',
      } : previous);
      setOutlookStatus((previous) => previous.state === 'loading' ? {
        ...previous,
        state: 'error',
        error: 'ยกเลิกแนวโน้มระยะไกลเพราะข้อมูลพยากรณ์หลักไม่พร้อม',
      } : previous);
      setForecastStatus((previous) => ({
        ...previous,
        state: 'error',
        error: error instanceof Error ? error.message : 'ประมวลผลพยากรณ์ไม่สำเร็จ',
      }));
    } finally {
      if (riskAbortRef.current === controller) setRiskLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!geoBlock) return;
    computeVillageRisk(geoBlock);
    const t = setInterval(() => computeVillageRisk(geoBlock), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [geoBlock, computeVillageRisk]);

  useEffect(() => () => {
    riskAbortRef.current?.abort();
    fcAbortRef.current?.abort();
  }, []);

  const riskByIdx = useMemo(() => {
    const m = new Map<number, any>();
    villageRisk.forEach((v) => m.set(v.featureIndex, v));
    return m;
  }, [villageRisk]);

  const tambonSummary = useMemo(() => {
    if (!villageRisk.length) return null;
    const usable = villageRisk.filter((v) => v.rain3h != null && v.riskIndex != null);
    if (!usable.length) return null;
    const mean = usable.reduce((s, v) => s + v.rain3h, 0) / usable.length;
    const peak = Math.max(...usable.map((v) => v.rain3h));
    const affected = usable.filter((v) => v.rain3h > 1).length;
    return { mean, peak, affected, worst: usable[0], pctArea: Math.round((affected / usable.length) * 100), level: usable[0].level };
  }, [villageRisk]);

  const alertVillages = useMemo(() => villageRisk.filter((v) =>
    v.alertState?.notificationStatus === 'awaiting_human_approval' &&
    ['warning', 'danger', 'critical'].includes(v.alertState.current)
  ), [villageRisk]);
  const alertSig = useMemo(() => alertVillages.map((v) => `${v.id}:${v.alertState.current}`).join('|'), [alertVillages]);
  const showAlert = forecastStatus.state === 'fresh' && alertVillages.length > 0 && alertSig !== dismissedSig;

  /* สถิติผ่าน RPC */
  useEffect(() => {
    if (!isStatsModalOpen) return;
    (async () => {
      setRealStats((p) => ({ ...p, isLoading: true }));
      try {
        if (!supabase) throw new Error('Supabase ยังไม่ได้ตั้งค่า');
        const { data, error } = await supabase.rpc('get_visit_stats');
        if (error) throw error;
        const s = Array.isArray(data) ? data[0] : data;
        setRealStats({
          totalVisits: Number(s?.total_visits || 0),
          totalUniqueVisitors: Number(s?.unique_visitors || 0),
          todayVisits: Number(s?.today_visits || 0),
          todayUniqueVisitors: Number(s?.today_unique || 0),
          isLoading: false,
        });
      } catch (e) { console.error(e); setRealStats((p) => ({ ...p, isLoading: false })); }
    })();
  }, [isStatsModalOpen]);

  /* player */
  useEffect(() => {
    let iv: any;
    if (isPlaying && radarData?.frames?.length) {
      iv = setInterval(() => {
        if (isRadarTileBlocked()) return;
        setCurrentFrameIndex((p) => (p + 1 >= radarData.frames.length ? 0 : p + 1));
      }, clampAnimationFrameMs(speed));
    }
    return () => clearInterval(iv);
  }, [isPlaying, radarData, speed]);

  const handleMapClick = async (lat: number, lng: number) => {
    setClickedLocation({ lat, lng });
    setIsFetchingForecast(true);
    setForecastData(null);

    const hitFeat = (geoBlock?.features || []).find((f: any) => pointInPolygon(lng, lat, f.geometry));
    setSelectedVillage(hitFeat ? riskByIdx.get(getIdx(hitFeat)) || null : null);

    fcAbortRef.current?.abort();
    const ac = new AbortController();
    fcAbortRef.current = ac;

    try {
      const r = await fetch(`/api/forecast?latitude=${lat}&longitude=${lng}`, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
      const payload = parseForecastApiResponse(await r.json());
      const d = payload.locations[0];
      const now = Date.now();
      let idx = d.hourly.time.findIndex((t: string) => new Date(`${t}:00+07:00`).getTime() >= now);
      if (idx < 0) idx = 0;
      const hours = [1, 2, 3].map((k) => ({
        time: d.hourly.time[idx + k] ? new Date(`${d.hourly.time[idx + k]}:00+07:00`) : null,
        rain: d.hourly.precipitation[idx + k] ?? null,
      }));
      const complete = hours.every((hour) => hour.rain != null);
      const total = complete ? hours.reduce((sum, hour) => sum + (hour.rain as number), 0) : null;
      if (!ac.signal.aborted) setForecastData({
        isRaining: total != null ? total > 0.5 : null,
        totalRain: total,
        hours,
        source: payload.source,
        fetchedAt: payload.fetchedAt,
        error: complete ? null : 'ข้อมูลฝนรายชั่วโมงไม่ครบถ้วน',
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') setForecastData({ error: e?.message || 'โหลดพยากรณ์ไม่สำเร็จ', hours: [] });
    }
    finally { if (!ac.signal.aborted) setIsFetchingForecast(false); }
  };

  const flyToVillage = useCallback((v: any) => {
    setSelectedVillage(v);
    mapRef.current?.flyTo([v.centroid[1], v.centroid[0]], 15, { duration: 1.2 });
    setIsSheetOpen(false);
  }, []);

  const getRainText = (mm: number) => {
    if (mm <= 0.1) return { text: 'ไม่มีฝน', color: 'text-gray-400', icon: '☀️' };
    if (mm <= 2.5) return { text: 'ฝนเล็กน้อย', color: 'text-green-400', icon: '🌦️' };
    if (mm <= 10) return { text: 'ฝนปานกลาง', color: 'text-yellow-400', icon: '🌧️' };
    return { text: 'ฝนตกหนัก', color: 'text-red-500', icon: '⛈️' };
  };

  const fmtNumber = (value: number | null | undefined, digits = 1) =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

  const agreementText = (agreement: string | undefined) => agreement === 'high' ? 'สอดคล้องสูง' :
    agreement === 'medium' ? 'สอดคล้องปานกลาง' : agreement === 'low' ? 'แตกต่างมาก' : 'ข้อมูลไม่พอเปรียบเทียบ';

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  const customPinIcon = L
    ? L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="relative flex items-center justify-center w-8 h-8"><div class="absolute inset-0 bg-blue-500 rounded-full blur-[4px] opacity-60 animate-ping"></div><div class="relative w-5 h-5 bg-[#38bdf8] border-2 border-white rounded-full shadow-lg z-10"></div></div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      })
    : null;

  const blockStyle = useCallback((feature: any) => {
    const v = riskByIdx.get(getIdx(feature));
    if (!showRisk || !v) return { color: '#F59E0B', weight: 1.2, fill: false, opacity: 0.6 };
    const isSel = selectedVillage?.id === v.id;
    return {
      color: isSel ? '#FFFFFF' : v.level.color, weight: isSel ? 3 : 1.6,
      fillColor: v.level.color, fillOpacity: v.level.key === 'normal' ? 0.1 : 0.38, opacity: 0.95,
    };
  }, [riskByIdx, showRisk, selectedVillage]);

  const onEachBlock = useCallback((feature: any, layer: any) => {
    const i = getIdx(feature);
    const v = riskByIdx.get(i);
    const name = getName(feature.properties, i);
    layer.unbindTooltip?.();
    if (showLabels)
      layer.bindTooltip(
        `<div><b>${name}</b>${v ? ` · <span style="color:${v.level.color}">${fmtNumber(v.rain3h)} มม.</span>` : ''}</div>`,
        { permanent: showRisk, direction: 'center', className: 'village-label' }
      );
    layer.off('click');
    layer.on('click', (e: any) => { e?.originalEvent?.stopPropagation?.(); if (v) flyToVillage(v); });
  }, [riskByIdx, showLabels, showRisk, flyToVillage]);

  const activeFrame: RadarFrame | null = radarData?.frames?.[currentFrameIndex] || null;
  const isNowcast = activeFrame?.kind === 'nowcast';
  const latestPast = radarData?.observedFrames?.[radarData.observedFrames.length - 1];
  const minutesAgo = latestPast ? Math.round((Date.now() - latestPast.time * 1000) / 60000) : null;
  const frameOffset = radarData ? (currentFrameIndex - (radarData.pastCount - 1)) * 10 : 0;
  const isStale = radarStatus.state === 'stale' || radarStatus.state === 'error';
  const observedMarkerPosition = radarData && radarData.frames.length > 1
    ? ((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100
    : 100;
  const bm = BASEMAPS[mapStyle];

  /* ═══════════ UI PARTS ═══════════ */
  const LayerToggle = ({ label, checked, onChange, badge, disabled = false }: any) => (
    <div className={`flex items-center justify-between group py-1 ${disabled ? 'opacity-55' : ''}`}>
      <label className={`flex items-center space-x-3 flex-1 min-w-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="ops-checkbox shrink-0" />
        <span className="text-[12px] font-medium text-[#D1D5DB] group-hover:text-white truncate">{label}</span>
      </label>
      {badge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#4178F3]/15 text-[#4178F3] border border-[#4178F3]/30 font-bold shrink-0 ml-2">{badge}</span>}
    </div>
  );

  const DataStatusBadge = ({ status }: { status: DataSourceStatus }) => {
    const state = status.state === 'loading' ? 'กำลังโหลด' : status.state === 'fresh' ? 'พร้อมใช้' :
      status.state === 'stale' ? 'ข้อมูลเก่า' : status.state === 'error' ? 'ผิดพลาด' : 'รอข้อมูล';
    const color = status.state === 'fresh' ? '#22C55E' : status.state === 'loading' ? '#38BDF8' :
      status.state === 'idle' ? '#94A3B8' : '#F97316';
    const detail = status.error || (status.freshness?.ageMinutes != null
      ? `${Math.round(status.freshness.ageMinutes)} นาทีที่แล้ว`
      : status.timestamp ? fmtTime(new Date(status.timestamp)) : 'ยังไม่มีเวลาอ้างอิง');
    return (
      <div title={`${status.source}: ${detail}`} className="liquid-bar flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] whitespace-nowrap">
        <span className="w-2 h-2 rounded-full ring-2 ring-white/10" style={{ background: color }} aria-hidden="true" />
        <span className="text-[#E1E9F7]">{status.source}</span>
        <span style={{ color }}>{state}</span>
      </div>
    );
  };

  const RankTable = ({ height = 'h-[320px]' }: any) => (
    <div className="w-full text-[11.5px]">
      <div className="flex font-bold text-[#8B94A5] border-b border-[#333946] pb-2.5 mb-1">
        <div className="w-7 text-center">#</div><div className="w-1.5 mr-2" />
        <div className="flex-1 pl-1">หมู่บ้าน</div>
        <div className="w-14 text-right text-[#4178F3]">ฝน 3 ชม.</div>
        <div className="w-12 text-right">ดัชนี</div>
        <div className="w-12 text-right pr-1">Peak</div>
      </div>
      <div className={`overflow-y-auto ${height} ops-scroll pr-2`}>
        {riskLoading && !villageRisk.length ? (
          <div className="py-10 text-center text-[#8B94A5] text-[12px] animate-pulse">กำลังประมวลผลรายหมู่บ้าน...</div>
        ) : villageRisk.length ? (
          villageRisk.map((v, i) => (
            <button key={v.id} onClick={() => flyToVillage(v)}
              className={`w-full flex items-center text-left text-[#D1D5DB] py-2.5 border-b border-white/5 hover:bg-white/8 cursor-pointer rounded-xl px-1.5 transition-colors ${selectedVillage?.id === v.id ? 'bg-white/10 ring-1 ring-[#75C5FF]/40' : ''}`}
              aria-label={`เปิดรายละเอียด ${v.name} ระดับ${v.level.name} ฝนคาดการณ์ 3 ชั่วโมง ${fmtNumber(v.rain3h)} มิลลิเมตร`}>
              <div className="w-7 text-center text-[#8B94A5] font-mono">{i + 1}</div>
              <div className="w-1.5 h-6 rounded-full mr-2 shrink-0" style={{ background: v.level.color, boxShadow: `0 0 8px ${v.level.glow}` }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[#E5E7EB] truncate">{v.name}</div>
                <div className="text-[9.5px] text-[#8B94A5] font-mono">หมู่ {v.moo} · {v.level.name}</div>
              </div>
              <div className="w-14 text-right font-mono text-white font-bold">{fmtNumber(v.rain3h)}</div>
              <div className="w-12 text-right font-mono text-[#8B94A5]">{fmtNumber(v.riskIndex)}</div>
              <div className="w-12 text-right font-mono pr-1">{v.peak}</div>
            </button>
          ))
        ) : (
          <div className="py-10 text-center text-[#8B94A5] text-[12px]">ไม่พบข้อมูล /geojson/block.json</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="liquid-radar relative w-screen h-screen bg-[#07111f] overflow-hidden text-white flex flex-col select-none">
      <style dangerouslySetInnerHTML={{ __html: `
        .liquid-radar {
          --glass: rgba(11, 24, 42, .62);
          --glass-strong: rgba(9, 20, 36, .82);
          --glass-soft: rgba(255, 255, 255, .075);
          --glass-line: rgba(255, 255, 255, .18);
          --glass-line-soft: rgba(255, 255, 255, .09);
          --ink: #f5f8ff;
          --muted: #aebbd0;
          --accent: #65b8ff;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
          background: radial-gradient(circle at 22% 0%, #183c61 0, #07111f 34%, #030812 100%);
        }
        .liquid-radar::before {
          content:''; position:absolute; inset:0; z-index:1; pointer-events:none;
          background:linear-gradient(180deg,rgba(5,12,22,.06),rgba(2,7,14,.34));
        }
        .leaflet-container { background:#07111f !important; }
        .leaflet-tile-pane, .leaflet-overlay-pane { cursor:crosshair; }
        .leaflet-control-attribution { background:rgba(7,17,31,.68) !important; backdrop-filter:blur(16px) saturate(150%); color:#aebbd0 !important; font-size:9px !important; padding:3px 8px !important; border:1px solid rgba(255,255,255,.1); border-radius:9px 0 0 0 !important; }
        .leaflet-control-attribution a { color:#65b8ff !important; }
        .ops-panel {
          background:linear-gradient(145deg,rgba(255,255,255,.105),rgba(255,255,255,.035)),var(--glass);
          border:1px solid var(--glass-line); border-radius:22px;
          box-shadow:0 24px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.16);
          backdrop-filter:blur(28px) saturate(165%); -webkit-backdrop-filter:blur(28px) saturate(165%);
        }
        .liquid-bar {
          background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.045)),var(--glass-strong);
          border:1px solid var(--glass-line); box-shadow:0 18px 60px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.2);
          backdrop-filter:blur(30px) saturate(170%); -webkit-backdrop-filter:blur(30px) saturate(170%);
        }
        .liquid-subpanel { background:rgba(255,255,255,.055) !important; border-color:var(--glass-line-soft) !important; }
        .ops-checkbox { appearance:none; width:18px; height:18px; border:1.5px solid rgba(255,255,255,.3); border-radius:6px; background:rgba(255,255,255,.06); cursor:pointer; position:relative; transition:.2s; }
        .ops-checkbox:checked { background:linear-gradient(145deg,#78c8ff,#278be8); border-color:#9bd7ff; box-shadow:0 0 14px rgba(69,166,255,.42); }
        .ops-checkbox:checked::after { content:''; position:absolute; left:3.5px; top:.5px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
        .ops-slider { -webkit-appearance:none; width:100%; height:5px; background:rgba(255,255,255,.15); border-radius:999px; outline:none; }
        .ops-slider::-webkit-slider-thumb { -webkit-appearance:none; width:17px; height:17px; border-radius:50%; background:#eef8ff; cursor:pointer; border:4px solid #3a9ff4; box-shadow:0 3px 14px rgba(0,0,0,.45),0 0 0 3px rgba(80,174,255,.18); }
        .ops-scroll::-webkit-scrollbar { width:6px; }
        .ops-scroll::-webkit-scrollbar-track { background:transparent; }
        .ops-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.2); border-radius:999px; }
        .village-label { background:rgba(8,20,36,.72) !important; backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.18) !important; color:#f5f8ff !important; font-size:10px !important; padding:3px 7px !important; border-radius:9px !important; box-shadow:0 8px 24px rgba(0,0,0,.25) !important; }
        .village-label::before { display:none !important; }
        .liquid-radar button, .liquid-radar select, .liquid-radar input { font:inherit; }
        .liquid-radar button:focus-visible, .liquid-radar select:focus-visible, .liquid-radar input:focus-visible, .liquid-radar a:focus-visible { outline:2px solid #8fd1ff; outline-offset:3px; }
        .liquid-radar button { min-height:36px; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        .animate-fade-in { animation: fadeIn .25s ease-out; }
        @media (max-width: 767px) {
          .liquid-bar { border-radius:0 0 22px 22px; }
          .ops-panel { border-radius:19px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in, .animate-pulse, .animate-ping, .animate-spin { animation:none !important; }
          * { scroll-behavior:auto !important; transition-duration:0.01ms !important; }
        }
      `}} />

      {/* ══ TOP BAR ══ */}
      <div className="absolute top-0 left-0 w-full h-8 z-[1999]" onMouseEnter={() => setIsTopHeaderVisible(true)} />
      <header
        className={`liquid-bar absolute top-2 md:top-3 left-1/2 -translate-x-1/2 w-[calc(100%-16px)] md:w-[96%] max-w-[1320px] min-h-[72px] rounded-[22px] z-[2000] flex items-center justify-between px-3 md:px-5 py-2 transition-transform duration-500 ${isTopHeaderVisible ? 'translate-y-0' : '-translate-y-[120%]'}`}>
        <div className="flex items-center space-x-4">
          <div className="w-11 h-11 bg-white/10 rounded-[14px] border border-white/20 flex items-center justify-center p-1.5 shadow-inner">
            <Image src="/Logogis3.png" alt="ตราสัญลักษณ์ระบบ GIS เทศบาลตำบลบ่อหลวง" width={36} height={36} priority className="w-full h-full object-contain opacity-95" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[14px] md:text-[15px] font-bold tracking-[-.01em] text-[#F5F8FF]">
                Bo Luang Radar <span className="hidden lg:inline font-medium text-[#C7D2E5]">· Observation & Village Forecast</span>
              </h1>
              <span className="hidden sm:inline-flex rounded-full border border-cyan-200/25 bg-cyan-300/10 px-2 py-0.5 text-[8px] font-bold tracking-[.12em] text-cyan-100">PUBLIC BETA</span>
            </div>
            <p className="text-[10px] md:text-[11px] text-[#AEBBD0] mt-1">เทศบาลตำบลบ่อหลวง · เครื่องมือสนับสนุนการตัดสินใจ</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="hidden lg:flex items-center space-x-2">
            <span className="text-[#8B94A5] font-bold text-[11px] uppercase">อัปเดต</span>
            <div className="px-3 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold text-[12px]">{fmtTime(riskUpdatedAt)} น.</div>
          </div>
          <button onClick={() => setReloadToken((token) => token + 1)} className="flex items-center px-3 md:px-4 py-2 bg-white/8 border border-white/15 text-[#E8F1FF] hover:bg-white/14 rounded-[14px] font-semibold space-x-2 shadow-inner" aria-label="โหลดข้อมูล Radar และ Forecast ใหม่">
            <svg className={`w-4 h-4 ${riskLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 9A7.003 7.003 0 006 7.293M4.582 15A7.003 7.003 0 0018 16.707" /></svg>
            <span className="hidden md:inline text-[12px]">รีเฟรช</span>
          </button>
          <button onClick={() => setIsStatsModalOpen(true)} className="hidden sm:flex items-center px-4 py-2 bg-[#4AAEFF]/12 border border-[#70C1FF]/25 text-[#8FD1FF] hover:bg-[#4AAEFF]/20 rounded-[14px] font-semibold space-x-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="text-[12px]">สถิติ</span>
          </button>
        </div>
      </header>
      {!isTopHeaderVisible && (
        <button onClick={() => setIsTopHeaderVisible(true)} onMouseEnter={() => setIsTopHeaderVisible(true)}
          className="liquid-bar absolute top-0 left-1/2 -translate-x-1/2 w-20 h-6 rounded-b-xl flex items-center justify-center cursor-pointer z-[1500] hover:bg-white/10">
          <div className="w-6 h-1 bg-[#8B94A5]/50 rounded-full" />
        </button>
      )}

      <div className="relative flex-1">
        {/* ══ MAP ══ */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[center.lat, center.lng]} zoom={12} maxZoom={20} minZoom={5}
            zoomControl={false} attributionControl preferCanvas className="w-full h-full">
            <MapRefBinder mapRef={mapRef} />
            <TileLayer key={mapStyle} url={bm.url} attribution={bm.attr}
              subdomains={bm.subdomains || 'abc'} maxZoom={20} maxNativeZoom={bm.maxNativeZoom} />
            {bm.labels && <TileLayer key={`${mapStyle}-lbl`} url={bm.labels} maxZoom={20} maxNativeZoom={19} pane="overlayPane" />}
            <SmoothRadar
              frame={activeFrame} frames={radarData?.frames || []} frameIndex={currentFrameIndex}
              enabled={showRadar} opacity={radarOpacity} quality={effectiveRadarQuality}
              colorScheme={colorScheme} gain={radarGain} cutoff={6} zIndex={300}
            />
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#FFFFFF', weight: 2, fill: false, opacity: 0.9, dashArray: '5,5' }} />}
            {showLandslide && geoLandslide && (
              <GeoJSON data={geoLandslide} style={(feature: any) => ({
                color: feature?.properties?.class >= 3 ? '#EF4444' : '#F59E0B',
                weight: 0.6,
                fillColor: feature?.properties?.class >= 3 ? '#EF4444' : '#F59E0B',
                fillOpacity: 0.24,
              }) as any} />
            )}
            {showBlock && geoBlock && (
              <GeoJSON key={`blk-${villageRisk.length}-${showRisk}-${showLabels}-${riskUpdatedAt?.getTime()}-${selectedVillage?.id ?? 'x'}`}
                data={geoBlock} style={blockStyle as any} onEachFeature={onEachBlock} />
            )}
            <ClickableMap onMapClick={handleMapClick} />
            {clickedLocation && customPinIcon && <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={customPinIcon} />}
          </MapContainer>
        </div>

        <div className="absolute top-[94px] left-1/2 -translate-x-1/2 z-[1300] hidden md:flex items-center gap-1.5 max-w-[92%]">
          <DataStatusBadge status={radarStatus} />
          <DataStatusBadge status={forecastStatus} />
          <DataStatusBadge status={metNorwayStatus} />
          <DataStatusBadge status={outlookStatus} />
          <DataStatusBadge status={geoJsonStatus} />
        </div>

        {healthStatus.status === 'degraded' && (
          <div className="liquid-bar absolute top-[86px] md:top-[132px] left-1/2 -translate-x-1/2 z-[1350] w-[92%] max-w-[660px] rounded-2xl border-orange-300/35 px-3 py-2 text-[11px] text-orange-100 flex items-center gap-2" role="status">
            <span aria-hidden="true">⚠️</span>
            <span className="flex-1">โหมดจำกัด: แหล่งข้อมูลบางส่วนไม่พร้อม ระบบจะไม่ใช้ข้อมูลเก่าหรือข้อมูลผิดพลาดออกสัญญาณเตือน</span>
            <button onClick={() => setReloadToken((token) => token + 1)} className="rounded-lg border border-orange-300/50 px-2 py-1 font-bold">ลองใหม่</button>
          </div>
        )}

        {/* ══ ALERT BANNER ══ */}
        {showAlert && (
          <div className="absolute top-[132px] left-1/2 -translate-x-1/2 z-[1400] w-[92%] max-w-[680px] animate-fade-in">
            <div className="rounded-2xl border px-4 py-3 flex items-center gap-3 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,.6)]"
              style={{ background: 'rgba(26,29,36,.93)', borderColor: alertVillages[0].level.color }}>
              <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: alertVillages[0].level.color, boxShadow: `0 0 12px ${alertVillages[0].level.glow}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-extrabold" style={{ color: alertVillages[0].level.color }}>
                  ⚠️ สัญญาณประกอบการเฝ้าระวังระดับ{alertVillages[0].level.name} — {alertVillages.length} หมู่บ้าน
                </div>
                <div className="text-[11px] text-[#D1D5DB] truncate mt-0.5">
                  {alertVillages.slice(0, 3).map((v) => `${v.name} ${v.rain3h.toFixed(0)} มม.`).join(' · ')}
                  {alertVillages.length > 3 ? ` และอีก ${alertVillages.length - 3} แห่ง` : ''} — ต้องให้เจ้าหน้าที่ตรวจสอบก่อนแจ้งเตือนจริง
                </div>
              </div>
              <button onClick={() => setDismissedSig(alertSig)} className="text-[#8B94A5] hover:text-white p-1 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* ══ LAYER PANEL ══ */}
        {isLayerMenuOpen ? (
          <div className="absolute top-[94px] left-5 z-[1000] w-[304px] ops-panel flex-col hidden md:flex">
            <div className="px-5 py-3.5 border-b border-white/10 flex justify-between items-center liquid-subpanel rounded-t-[22px]">
              <h3 className="text-[13px] font-bold text-[#E5E7EB] flex items-center">
                <svg className="w-4 h-4 mr-2 text-[#4178F3]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                จัดการชั้นข้อมูล
              </h3>
              <button onClick={() => setIsLayerMenuOpen(false)} className="text-[#8B94A5] hover:text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex flex-col max-h-[calc(100vh-170px)]">
              <div className="p-4 border-b border-[#333946]">
                <div className="grid grid-cols-4 gap-2.5">
                  {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
                    <div key={id} onClick={() => setMapStyle(id)}
                      className={`flex flex-col items-center p-1.5 rounded-xl border cursor-pointer transition-all ${mapStyle === id ? 'bg-[#292E38] border-[#4178F3]' : 'border-[#333946] hover:border-[#4B5563]'}`}>
                      <div className={`w-full h-7 ${BASEMAPS[id].swatch} rounded-md border border-[#333946] mb-1.5`} />
                      <span className={`text-[10px] font-bold ${mapStyle === id ? 'text-[#4178F3]' : 'text-[#8B94A5]'}`}>{BASEMAPS[id].name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 overflow-y-auto ops-scroll pr-2 rounded-b-xl">
                <LayerToggle label="เรดาร์คอมโพสิต" checked={showRadar} onChange={(e: any) => setShowRadar(e.target.checked)} badge="LIVE" />
                <div className="pl-7 pr-1 pb-3 pt-1.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความทึบ</span>
                    <input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="ops-slider flex-1" />
                    <span className="text-[9.5px] font-mono text-[#4178F3] w-[26px] text-right">{Math.round(radarOpacity * 100)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความคม</span>
                    <div className="flex bg-[#111319] rounded border border-[#333946] overflow-hidden flex-1">
                      {([{ k: 'bicubic', t: 'สูงสุด' }, { k: 'bilinear', t: 'สมดุล' }, { k: 'raw', t: 'ประหยัด' }] as const).map((o) => (
                        <button key={o.k} onClick={() => setRadarQuality(o.k)} disabled={isPlaying}
                          title={isPlaying ? 'หยุดแอนิเมชันก่อนเปลี่ยนความคม' : undefined}
                          className={`flex-1 py-1 text-[9.5px] font-bold transition-colors ${effectiveRadarQuality === o.k ? 'bg-[#4178F3]/20 text-[#4178F3]' : 'text-[#8B94A5] hover:bg-[#2D323B]'} ${isPlaying ? 'cursor-not-allowed opacity-70' : ''}`}>{o.t}</button>
                      ))}
                    </div>
                  </div>
                  {isPlaying && <p className="pl-[54px] text-[9px] text-[#8B94A5]">แอนิเมชันใช้โหมดประหยัดเพื่อให้ปุ่มและแผนที่ตอบสนอง</p>}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความเข้ม</span>
                    <input type="range" min="0.6" max="1.8" step="0.05" value={radarGain} onChange={(e) => setRadarGain(parseFloat(e.target.value))} className="ops-slider flex-1" />
                    <span className="text-[9.5px] font-mono text-[#4178F3] w-[26px] text-right">{radarGain.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">พาเลตต์</span>
                    <select value={colorScheme} onChange={(e) => setColorScheme(Number(e.target.value))}
                      className="flex-1 bg-[#111319] border border-[#333946] text-[#D1D5DB] text-[10px] rounded px-1.5 py-1 outline-none">
                      {SCHEMES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
                    </select>
                  </div>
                </div>

                <LayerToggle label="ฝนสะสมคาดการณ์ 3 ชม. (รายหมู่บ้าน)" checked={showRisk} onChange={(e: any) => setShowRisk(e.target.checked)} badge="FORECAST" />
                <LayerToggle label="ป้ายชื่อหมู่บ้าน" checked={showLabels} onChange={(e: any) => setShowLabels(e.target.checked)} />
                <div className="border-t border-[#333946] my-3" />
                <LayerToggle label="ขอบเขตตำบลบ่อหลวง" checked={showBoluang} onChange={(e: any) => setShowBoluang(e.target.checked)} />
                <LayerToggle label={`ขอบเขตหมู่บ้าน (${geoBlock?.features?.length || 0} โซน)`} checked={showBlock} onChange={(e: any) => setShowBlock(e.target.checked)} />
                <LayerToggle label="พื้นที่เสี่ยงดินถล่ม" checked={showLandslide} onChange={(e: any) => setShowLandslide(e.target.checked)} badge={landslideStatus === 'ready' ? 'พร้อมใช้' : landslideStatus === 'error' ? 'โหลดไม่สำเร็จ' : landslideStatus === 'loading' ? 'กำลังโหลด' : 'โหลดเมื่อเปิด'} />
                <LayerToggle label="พื้นที่น้ำท่วมซ้ำซาก" checked={false} onChange={() => {}} disabled badge="ไม่มีชุดข้อมูล" />
                <LayerToggle label="คำอธิบายสัญลักษณ์" checked={isLegendOpen} onChange={(e: any) => setIsLegendOpen(e.target.checked)} />
                <div className="mt-3 text-[10px] text-[#8B94A5] leading-relaxed bg-[#111319] border border-[#333946] rounded-lg p-2.5">
                  ดัชนีเสี่ยง = <b className="text-[#D1D5DB]">ฝนคาด 3 ชม. × ดินอิ่มน้ำ × ความลาดชัน</b>
                </div>
                <div className="mt-2 text-[9px] text-[#8B94A5] leading-relaxed">
                  เรดาร์: RainViewer · พยากรณ์หลัก: Open-Meteo · ตรวจสอบไขว้: MET Norway · แผนที่ฐาน: Esri / CARTO / OSM
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsLayerMenuOpen(true)} className="absolute top-5 left-5 z-[1000] p-2.5 bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl text-[#E5E7EB] hidden md:block hover:bg-[#232732]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
        )}

        {/* ══ RANKING PANEL ══ */}
        {isTablePanelOpen ? (
          <div className="absolute top-[94px] right-5 z-[900] w-[404px] ops-panel flex-col hidden xl:flex overflow-hidden">
            <div className="flex border-b border-[#333946] bg-[#111319]">
              <button onClick={() => setScope('village')} className={`px-5 py-3 text-[12px] font-bold ${scope === 'village' ? 'text-[#4178F3] border-b-2 border-[#4178F3] bg-[#1A1D24]' : 'text-[#8B94A5] hover:text-[#E5E7EB]'}`}>รายหมู่บ้าน</button>
              <button onClick={() => setScope('tambon')} className={`px-5 py-3 text-[12px] font-bold ${scope === 'tambon' ? 'text-[#4178F3] border-b-2 border-[#4178F3] bg-[#1A1D24]' : 'text-[#8B94A5] hover:text-[#E5E7EB]'}`}>สรุประดับตำบล</button>
              <button onClick={() => setIsTablePanelOpen(false)} className="ml-auto px-4 text-[#8B94A5] hover:text-[#EF4444]">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" /></svg>
              </button>
            </div>
            <div className="p-5">
              {scope === 'village' ? (
                <>
                  <h3 className="text-[13.5px] font-bold text-[#E5E7EB] mb-1">ประมาณการฝนสะสม 3 ชั่วโมงล่วงหน้า</h3>
                  <p className="text-[10.5px] text-[#8B94A5] mb-3">เรียงตามดัชนีเสี่ยง · หน่วยฝน มม. · คลิกเพื่อซูม</p>
                  <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-[#333946]">
                    {LEVELS.map((l) => (
                      <span key={l.key} className="flex items-center text-[9.5px] text-[#8B94A5] px-1.5 py-0.5 rounded bg-[#111319] border border-[#333946]">
                        <span className="w-2 h-2 rounded-full mr-1" style={{ background: l.color }} />{l.name}
                      </span>
                    ))}
                  </div>
                  <RankTable />
                </>
              ) : tambonSummary ? (
                <div className="space-y-4">
                  <h3 className="text-[13.5px] font-bold text-[#E5E7EB]">ภาพรวม ต.บ่อหลวง (3 ชม. ล่วงหน้า)</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'ฝนเฉลี่ยทั้งตำบล', v: `${tambonSummary.mean.toFixed(1)} มม.`, c: '#4178F3' },
                      { l: 'ฝนสูงสุดรายหมู่บ้าน', v: `${tambonSummary.peak.toFixed(1)} มม.`, c: tambonSummary.level.color },
                      { l: '% พื้นที่มีฝน', v: `${tambonSummary.pctArea}%`, c: '#22C55E' },
                      { l: 'หมู่บ้านเฝ้าระวัง+', v: `${alertVillages.length} แห่ง`, c: '#F97316' },
                    ].map((s) => (
                      <div key={s.l} className="bg-[#111319] border border-[#333946] rounded-xl p-3">
                        <p className="text-[10.5px] text-[#8B94A5] mb-1">{s.l}</p>
                        <p className="text-[20px] font-black font-mono" style={{ color: s.c }}>{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border p-3.5" style={{ borderColor: tambonSummary.level.color, background: `${tambonSummary.level.color}14` }}>
                    <p className="text-[12px] font-bold" style={{ color: tambonSummary.level.color }}>สถานะตำบล: {tambonSummary.level.name}</p>
                    <p className="text-[11px] text-[#D1D5DB] mt-1">เสี่ยงสูงสุด: <b>{tambonSummary.worst.name}</b> ({tambonSummary.worst.rain3h.toFixed(1)} มม.)</p>
                    <p className="text-[11px] text-[#8B94A5] mt-1.5">แนวปฏิบัติ: {tambonSummary.level.act}</p>
                  </div>
                  <div className="bg-[#111319] border border-[#333946] rounded-xl p-3 text-[11px] text-[#8B94A5]">
                    ดินอิ่มน้ำ (API) เฉลี่ย: <b className="text-[#D1D5DB] font-mono">{fmtNumber(
                      villageRisk.some((v) => v.api7 != null)
                        ? villageRisk.filter((v) => v.api7 != null).reduce((s, v) => s + v.api7, 0) / villageRisk.filter((v) => v.api7 != null).length
                        : null,
                      0,
                    )} มม.</b>
                    {' '}(×{fmtNumber(
                      villageRisk.some((v) => v.soilFactor != null)
                        ? villageRisk.filter((v) => v.soilFactor != null).reduce((s, v) => s + v.soilFactor, 0) / villageRisk.filter((v) => v.soilFactor != null).length
                        : null,
                      2,
                    )})
                  </div>
                </div>
              ) : <div className="py-10 text-center text-[#8B94A5] text-[12px] animate-pulse">กำลังคำนวณ...</div>}
            </div>
          </div>
        ) : (
          <button onClick={() => setIsTablePanelOpen(true)} className="absolute top-5 right-5 z-[900] px-4 py-2.5 bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl text-[12px] font-bold text-[#E5E7EB] hidden xl:block hover:bg-[#232732]">
            อันดับหมู่บ้านเสี่ยง
          </button>
        )}

        {/* ══ VILLAGE DETAIL ══ */}
        {selectedVillage && (
          <div className="absolute top-[112px] right-5 xl:right-[442px] z-[1050] w-[336px] ops-panel animate-fade-in hidden md:block" style={{ borderColor: `${selectedVillage.level.color}66` }}>
            <div className="px-5 py-4 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center border text-[13px] font-black shrink-0"
                  style={{ background: `${selectedVillage.level.color}22`, borderColor: `${selectedVillage.level.color}88`, color: selectedVillage.level.color }}>{selectedVillage.moo}</div>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-[#E5E7EB] truncate">{selectedVillage.name}</h3>
                  <p className="text-[10px] font-mono mt-0.5" style={{ color: selectedVillage.level.color }}>ระดับ{selectedVillage.level.name}</p>
                </div>
              </div>
              <button onClick={() => setSelectedVillage(null)} className="text-[#8B94A5] hover:text-[#EF4444] p-1.5 rounded-lg border border-[#333946] shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                {[{ l: '1 ชม.', v: selectedVillage.rain1h }, { l: '3 ชม. (คาด)', v: selectedVillage.rain3h }, { l: '24 ชม. ผ่านมา', v: selectedVillage.rain24h }].map((s) => (
                  <div key={s.l} className="bg-[#111319] border border-[#333946] rounded-xl p-2.5 text-center">
                    <p className="text-[9px] text-[#8B94A5]">{s.l}</p>
                    <p className="text-[16px] font-black font-mono text-[#E5E7EB] mt-0.5">{fmtNumber(s.v)}</p>
                    <p className="text-[8.5px] text-[#8B94A5]">มม.</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#8B94A5] mb-2">พยากรณ์รายชั่วโมง</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {selectedVillage.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain ?? 0);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className="text-[10px] font-mono text-[#E5E7EB]">{fmtTime(h.time)}</div>
                        <div className={`text-[10px] font-bold mt-0.5 ${r.color}`}>{fmtNumber(h.rain)} มม.</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-[#333946] bg-[#171A21]/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11.5px] font-bold text-[#E5E7EB]">แนวโน้ม D+7 ถึง D+9</p>
                    <p className="mt-0.5 text-[9.5px] text-[#8B94A5]">ใช้วางแผนและติดตามเท่านั้น · ไม่ใช้ยกระดับ Alert อัตโนมัติ</p>
                  </div>
                  <span className="rounded-md border border-[#FACC15]/40 bg-[#FACC15]/10 px-2 py-1 text-[9px] font-bold text-[#FACC15]">ความเชื่อมั่นต่ำ</span>
                </div>
                {selectedVillage.longRangeOutlook?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {selectedVillage.longRangeOutlook.map((day: any) => {
                      const signalLabel = day.signal === 'prepare' ? 'เตรียมพร้อม' : day.signal === 'monitor' ? 'ติดตาม' : day.signal === 'low' ? 'แนวโน้มต่ำ' : 'ข้อมูลไม่พอ';
                      const signalClass = day.signal === 'prepare' ? 'text-[#F97316]' : day.signal === 'monitor' ? 'text-[#FACC15]' : day.signal === 'low' ? 'text-[#22C55E]' : 'text-[#94A3B8]';
                      return (
                        <div key={day.date} className="rounded-lg border border-[#333946] bg-[#232732] p-2 text-center">
                          <p className="text-[9px] font-bold text-[#8B94A5]">D+{day.leadDay}</p>
                          <p className="mt-0.5 text-[9px] text-[#D1D5DB]">{new Date(`${day.date}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</p>
                          <p className="mt-1 text-[13px] font-bold text-[#E5E7EB]">{fmtNumber(day.consensusRainMm)} มม.</p>
                          <p className="text-[8.5px] text-[#8B94A5]">โอกาส {fmtNumber(day.precipitationProbabilityPct, 0)}%</p>
                          <p className={`mt-1 text-[9px] font-bold ${signalClass}`}>● {signalLabel}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="mt-3 text-[10px] text-[#94A3B8]">ยังไม่มีข้อมูลระยะไกลที่ผ่านการตรวจสอบ</p>}
                <p className="mt-2 text-[9px] leading-relaxed text-[#8B94A5]">ค่าฝนเป็น consensus รายวันจาก Open-Meteo และ MET Norway; ความต่างระหว่างแบบจำลองใช้บอกความไม่แน่นอน ไม่ใช่ค่าความน่าจะเป็นของภัยพิบัติ</p>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: selectedVillage.level.color, background: `${selectedVillage.level.color}12` }}>
                <p className="text-[11.5px] font-bold" style={{ color: selectedVillage.level.color }}>ข้อเสนอประกอบการตรวจสอบ</p>
                <p className="text-[11px] text-[#D1D5DB] mt-1">{selectedVillage.level.act}</p>
              </div>
              <div className="text-[10px] text-[#8B94A5] font-mono grid grid-cols-2 gap-y-1 border-t border-[#333946] pt-3">
                <span>จุดตัวอย่าง</span><span className="text-right text-[#D1D5DB]">{selectedVillage.sampleCount} จุด ({Math.round(selectedVillage.sampleCoverage * 100)}%)</span>
                <span>ฝน 3 ชม. mean</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.rain3hMean)} มม.</span>
                <span>ฝน 3 ชม. max</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.rain3hMax)} มม.</span>
                <span>ฝน 3 ชม. p90</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.rain3hP90)} มม. (ใช้ประเมิน)</span>
                <span>MET Norway 3 ชม.</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.forecastComparison?.referenceRain3h)} มม. (ตรวจสอบไขว้)</span>
                <span>เทียบแบบจำลอง</span><span className={`text-right font-bold ${selectedVillage.forecastComparison?.agreement === 'low' ? 'text-[#F97316]' : 'text-[#D1D5DB]'}`}>
                  {agreementText(selectedVillage.forecastComparison?.agreement)}{selectedVillage.forecastComparison?.differenceMm != null ? ` · ต่าง ${fmtNumber(selectedVillage.forecastComparison.differenceMm)} มม.` : ''}
                </span>
                <span>โอกาสฝนสูงสุด</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.maxProb, 0)}%</span>
                <span>ดินอิ่มน้ำ (API)</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.api7, 0)} มม. (×{fmtNumber(selectedVillage.soilFactor, 2)})</span>
                <span>ตัวคูณภูมิประเทศ</span><span className="text-right text-[#D1D5DB]">×{fmtNumber(selectedVillage.terrainFactor, 2)}</span>
                <span>ดัชนีเสี่ยงรวม</span><span className="text-right text-[#D1D5DB]">{fmtNumber(selectedVillage.riskIndex)}</span>
                <span>ความเชื่อมั่น</span><span className="text-right text-[#D1D5DB]">{selectedVillage.confidence === 'low' ? 'ต่ำ' : selectedVillage.confidence === 'medium' ? 'ปานกลาง' : 'สูง'}</span>
                <span>เวลาข้อมูล</span><span className="text-right text-[#D1D5DB]">{fmtTime(riskUpdatedAt)} น.</span>
                <span>แหล่งข้อมูล</span><span className="text-right text-[#D1D5DB]">Open-Meteo (ประเมิน) · MET Norway (เทียบ)</span>
                <span>สถานะ Alert</span><span className="text-right text-[#D1D5DB]">{selectedVillage.alertState.current.toUpperCase()} · {selectedVillage.alertState.notificationStatus === 'awaiting_human_approval' ? 'รออนุมัติ' : 'ยังไม่ส่ง'}</span>
                {selectedVillage.households > 0 && (<><span>ครัวเรือน</span><span className="text-right text-[#D1D5DB]">{selectedVillage.households}</span></>)}
                <span>พิกัด</span><span className="text-right text-[#D1D5DB]">{selectedVillage.centroid[1].toFixed(4)}, {selectedVillage.centroid[0].toFixed(4)}</span>
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVillage.centroid[1]},${selectedVillage.centroid[0]}`} target="_blank" rel="noreferrer"
                className="block w-full text-center py-2.5 rounded-xl bg-[#4178F3]/15 border border-[#4178F3]/40 text-[#4178F3] text-[12px] font-bold hover:bg-[#4178F3]/25">นำทางไปยังหมู่บ้าน</a>
            </div>
          </div>
        )}

        {/* ══ POINT FORECAST ══ */}
        {clickedLocation && !selectedVillage && (
          <div className="absolute top-[112px] right-5 xl:right-[442px] z-[1040] w-[326px] ops-panel animate-fade-in hidden md:block">
            <div className="px-5 py-4 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
              <div>
                <h3 className="text-[13px] font-bold text-[#E5E7EB]">พิกัดที่เลือก</h3>
                <p className="text-[10px] text-[#4178F3] font-mono mt-0.5">{clickedLocation.lat.toFixed(5)}, {clickedLocation.lng.toFixed(5)}</p>
              </div>
              <button onClick={() => setClickedLocation(null)} className="text-[#8B94A5] hover:text-[#EF4444] p-1.5 rounded-lg border border-[#333946]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              {isFetchingForecast ? (
                <p className="text-[12px] text-[#8B94A5] text-center py-8 animate-pulse">กำลังดึงข้อมูลพยากรณ์...</p>
              ) : forecastData?.error ? (
                <div className="rounded-xl border border-[#F97316]/50 bg-[#F97316]/10 p-3 text-[11px] text-[#FDBA74]">
                  {forecastData.error}
                </div>
              ) : forecastData ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {forecastData.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className="text-[9.5px] font-mono text-[#8B94A5]">{fmtTime(h.time)}</div>
                        <div className={`text-[10px] font-bold ${r.color}`}>{fmtNumber(h.rain)} มม.</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ══ MAP TOOLS ══ */}
        <div className="absolute bottom-[160px] md:bottom-32 right-5 z-[900] flex flex-col space-y-2">
          <div className="bg-[#1A1D24]/90 backdrop-blur-md border border-[#333946] rounded-xl flex flex-col overflow-hidden">
            <button onClick={() => mapRef.current?.flyTo([center.lat, center.lng], 12, { duration: 1.4 })} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] border-b border-[#333946]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </button>
            <button onClick={() => mapRef.current?.zoomIn()} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B] border-b border-[#333946]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m-6-6h12" /></svg>
            </button>
            <button onClick={() => mapRef.current?.zoomOut()} className="w-11 h-11 flex items-center justify-center text-[#8B94A5] hover:text-white hover:bg-[#2D323B]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </button>
          </div>
        </div>

        {/* ══ LEGEND ══ */}
        {isLegendOpen && (
          <div className="absolute bottom-8 left-5 z-[900] ops-panel px-3 py-3 w-[188px] bg-[#1A1D24]/95 backdrop-blur-md hidden lg:block">
            <h3 className="text-[11.5px] font-bold text-[#E5E7EB] mb-2">ระดับความรุนแรงฝน</h3>
            <div className="space-y-1">
              {RAIN_BANDS.map((b) => (
                <div key={b.label} className="flex items-center text-[9.5px]">
                  <span className="w-4 h-[10px] rounded-sm shrink-0" style={{ background: b.c }} />
                  <span className="flex-1 text-[#D1D5DB] pl-1.5">{b.label}</span>
                  <span className="text-[#8B94A5] font-mono">{b.dbz} dBZ</span>
                </div>
              ))}
            </div>
            <p className="mt-2 pt-2 border-t border-[#333946] text-[8.5px] text-[#8B94A5] leading-relaxed">
              ค่าอ้างอิงสมการ Z–R (Marshall–Palmer)<br />สีบนแผนที่ใช้พาเลตต์ RainViewer #{colorScheme}
            </p>
            <div className="mt-2 pt-2 border-t border-[#333946] space-y-1">
              {LEVELS.map((l) => (
                <div key={l.key} className="flex items-center text-[9px]">
                  <span className="w-3 h-2.5 rounded-sm mr-1.5" style={{ background: l.color }} />
                  <span className="text-[#8B94A5] flex-1">ดัชนีเสี่ยง · {l.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ TIMELINE PLAYER ══ */}
        <div className="absolute bottom-[92px] md:bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-[620px] z-[1000]">
          <div className="ops-panel overflow-hidden">
            <div className="px-5 py-2.5 border-b border-[#333946] flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[#E5E7EB] truncate">
                Radar {isNowcast ? '(Nowcasting)' : ''} — {fmtDate(activeFrame ? activeFrame.time * 1000 : null)} {fmtTime(activeFrame ? activeFrame.time * 1000 : null)} น.
              </span>
              {blockedNow ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B] shrink-0">ชะลอโหลด (rate limit)</span>
              ) : (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${isNowcast ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[#4178F3]/15 text-[#4178F3]'}`}>
                  {isNowcast ? `T+${frameOffset}` : frameOffset === 0 ? 'ปัจจุบัน (T+0)' : `ย้อนหลัง ${Math.abs(frameOffset)} นาที`}
                </span>
              )}
            </div>

            <div className="px-5 py-3 flex items-center gap-3">
              <button onClick={() => setIsPlaying(!isPlaying)} disabled={blockedNow}
                aria-label={isPlaying ? 'หยุดแอนิเมชันเรดาร์' : 'เล่นแอนิเมชันเรดาร์'}
                className={`text-[#E5E7EB] hover:text-[#4178F3] bg-[#232732] p-1.5 rounded-full border border-[#333946] shrink-0 ${blockedNow ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {isPlaying ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <div className="flex-1 relative flex items-center h-8">
                <input type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  aria-label="เลือกเวลาเฟรมเรดาร์"
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }} className="w-full ops-slider z-10"
                  style={{ background: `linear-gradient(to right, #4178F3 0%, #4178F3 ${observedMarkerPosition}%, #F59E0B ${observedMarkerPosition}%, #F59E0B 100%)` }} />
                {radarData && <div className="absolute h-4 w-[2px] bg-[#F59E0B] z-0 rounded-full" style={{ left: `${observedMarkerPosition}%` }} />}
              </div>
              <button onClick={() => { setIsPlaying(false); setCurrentFrameIndex((radarData?.pastCount || 1) - 1); }}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded border border-[#333946] text-[#4178F3] hover:bg-[#232732] shrink-0">T+0</button>
              <span className="text-[10px] font-mono text-[#8B94A5] shrink-0">{currentFrameIndex + 1}/{radarData?.frames?.length || 0}</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="bg-[#111319] border border-[#333946] text-[#8B94A5] text-[10px] rounded px-1.5 py-1 outline-none shrink-0">
                <option value={1600}>0.5x</option><option value={1100}>1x</option><option value={900}>1.5x</option>
              </select>
            </div>

            <div className="px-5 pb-2.5 text-[10px] font-mono flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-[#EF4444]' : 'bg-[#22C55E] animate-pulse'}`} />
              <span className={isStale ? 'text-[#EF4444] font-bold' : 'text-[#8B94A5]'}>
                {isStale ? '⚠ ข้อมูลล้าสมัย · ' : 'ข้อมูลล่าสุด: '}
                {fmtTime(latestPast ? latestPast.time * 1000 : null)} น.
                {minutesAgo != null && ` (${minutesAgo} นาทีที่แล้ว)`}
              </span>
            </div>
            <div className="px-5 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#8B94A5]">
              <span><span className="text-[#4178F3]">●</span> Radar observation</span>
              <span><span className="text-[#F59E0B]">●</span> RainViewer nowcast {radarData?.nowcastFrames.length ? '' : '(ขณะนี้ไม่มีข้อมูล)'}</span>
              <span><span className="text-[#22C55E]">◆</span> Open‑Meteo forecast 3 ชม. แยกจาก timeline เรดาร์</span>
            </div>
          </div>
        </div>

        {/* ══ MOBILE SHEET ══ */}
        <div className={`md:hidden absolute left-0 right-0 bottom-0 z-[1200] transition-transform duration-300 ${isSheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]'}`}>
          <div className="liquid-bar border-t border-white/15 rounded-t-[26px] shadow-[0_-18px_55px_rgba(0,0,0,.48)] max-h-[76vh] flex flex-col">
            <div onClick={() => setIsSheetOpen(!isSheetOpen)} className="py-3 px-5 cursor-pointer">
              <div className="w-10 h-1 bg-[#4B5563] rounded-full mx-auto mb-2.5" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: villageRisk[0]?.level.color || '#4178F3' }} />
                  <span className="text-[12.5px] font-bold text-[#E5E7EB] truncate">
                    {villageRisk.length ? `เสี่ยงสุด: ${villageRisk[0].name} ${fmtNumber(villageRisk[0].rain3h)} มม.` : 'กำลังประมวลผล...'}
                  </span>
                </div>
                <span className="text-[10px] text-[#8B94A5] shrink-0 ml-2">{isSheetOpen ? 'ปิด' : 'ดูทั้งหมด'}</span>
              </div>
            </div>
            <div className="px-4 pb-6 overflow-hidden">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LEVELS.map((l) => (
                  <span key={l.key} className="flex items-center text-[9px] text-[#8B94A5] px-1.5 py-0.5 rounded bg-[#111319] border border-[#333946]">
                    <span className="w-2 h-2 rounded-full mr-1" style={{ background: l.color }} />{l.name}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setShowRisk(!showRisk)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showRisk ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>ชั้นเสี่ยง</button>
                <button onClick={() => setShowRadar(!showRadar)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showRadar ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>เรดาร์</button>
                <button onClick={() => setReloadToken((token) => token + 1)} className="flex-1 py-2 rounded-lg text-[11px] font-bold border border-[#333946] text-[#D1D5DB]">รีเฟรช</button>
              </div>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setShowBlock(!showBlock)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showBlock ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>ขอบเขตหมู่บ้าน</button>
                <button onClick={() => setShowLabels(!showLabels)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showLabels ? 'bg-[#4178F3]/15 border-[#4178F3]/40 text-[#4178F3]' : 'border-[#333946] text-[#8B94A5]'}`}>ป้ายหมู่บ้าน</button>
                <button onClick={() => setShowLandslide(!showLandslide)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${showLandslide ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B]' : 'border-[#333946] text-[#8B94A5]'}`}>ดินถล่ม</button>
              </div>
              <RankTable height="h-[42vh]" />
            </div>
          </div>
        </div>
      </div>

      {/* ══ STATS MODAL ══ */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsStatsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-[90%] max-w-[520px] shadow-2xl overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 flex justify-between items-center border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-[17px] font-extrabold text-gray-800">สถิติการใช้งาน</h2>
              <button onClick={() => setIsStatsModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-100 hover:bg-red-500 p-1.5 rounded-lg transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6">
              {realStats.isLoading ? (
                <p className="py-12 text-center text-gray-500 text-[13px] font-bold animate-pulse">กำลังเชื่อมต่อฐานข้อมูล...</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { l: 'ยอดเข้าชมสะสม', v: realStats.totalVisits, u: 'ครั้ง', bg: 'bg-blue-50', bd: 'border-blue-100', tx: 'text-blue-600' },
                    { l: 'ผู้เข้าชมสะสม', v: realStats.totalUniqueVisitors, u: 'คน', bg: 'bg-emerald-50', bd: 'border-emerald-100', tx: 'text-emerald-600' },
                    { l: 'ยอดเข้าชมวันนี้', v: realStats.todayVisits, u: 'ครั้ง', bg: 'bg-purple-50', bd: 'border-purple-100', tx: 'text-purple-600' },
                    { l: 'ผู้เข้าชมวันนี้', v: realStats.todayUniqueVisitors, u: 'คน', bg: 'bg-orange-50', bd: 'border-orange-100', tx: 'text-orange-600' },
                  ].map((s) => (
                    <div key={s.l} className={`${s.bg} border ${s.bd} rounded-2xl p-4`}>
                      <p className={`text-[12px] ${s.tx} font-bold mb-1`}>{s.l}</p>
                      <p className="text-[26px] font-black text-gray-800">{s.v.toLocaleString()}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{s.u}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
