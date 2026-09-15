'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useMapEvents, useMap } from 'react-leaflet';
import { createClient } from '@supabase/supabase-js';

/* ═══════════════════════════ SUPABASE ═══════════════════════════ */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((m) => m.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });

/* ═══════════════════════════ CONFIG ═══════════════════════════ */
const TZ = 'Asia/Bangkok';
const NATIVE_Z = 12;              // zoom สูงสุดที่ RainViewer มีข้อมูลจริง (standard tile grid)
const RV_SCHEME_DEFAULT = 4;
const STALE_MINUTES = 20;

type Quality = 'bicubic' | 'bilinear' | 'raw';
type RadarFrame = { time: number; path: string };

const LOW_MEM =
  typeof window !== 'undefined' &&
  ((((navigator as any).deviceMemory ?? 4) <= 4) ||
   (((navigator as any).hardwareConcurrency ?? 4) <= 4) ||
   window.innerWidth < 768);

const SRC = 512;                              // ขนาดภาพ tile ที่ขอจาก RainViewer
const CACHE_MAX = LOW_MEM ? 40 : 90;          // 1 tile 512px ≈ 1 MB  →  40 MB / 90 MB
const PREFETCH_RADIUS = LOW_MEM ? 1 : 3;
const PREFETCH_MAX_TILES = 16;
const MAX_INFLIGHT = 4;                       // ยิงพร้อมกันสูงสุด
const NEG_TTL = 60_000;                       // จำ tile ที่พังไว้ 60 วิ

/* ═══════════════════ TIME (ล็อก Asia/Bangkok) ═══════════════════ */
const toDate = (d: Date | number | null | undefined) =>
  d == null ? null : typeof d === 'number' ? new Date(d) : d;
const fmtTime = (d: Date | number | null | undefined) => {
  const x = toDate(d);
  return x ? x.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '--:--';
};
const fmtDate = (d: Date | number | null | undefined) => {
  const x = toDate(d);
  return x ? x.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) : '-';
};

/* ═══════════ TILE LOADER: queue + circuit breaker + neg-cache ═══════════ */
const tileCache = new Map<string, Promise<ImageData | null>>();
const negCache = new Map<string, number>();

const touchCache = (k: string, p: Promise<ImageData | null>) => {
  tileCache.delete(k); tileCache.set(k, p);
  while (tileCache.size > CACHE_MAX) {
    const o = tileCache.keys().next().value as string | undefined;
    if (o === undefined) break;
    tileCache.delete(o);
  }
};

const pruneTileCache = (paths: string[]) => {
  if (!paths.length) return;
  for (const k of Array.from(tileCache.keys()))
    if (!paths.some((p) => k.includes(p))) tileCache.delete(k);
};

let inFlight = 0;
const waitQ: (() => void)[] = [];
let breakerUntil = 0;
let breakerTick = 0;                       // ใช้ trigger re-render แบดจ์

const acquire = () => new Promise<void>((res) => {
  const run = () => { if (inFlight < MAX_INFLIGHT) { inFlight++; res(); } else waitQ.push(run); };
  run();
});
const release = () => { inFlight = Math.max(0, inFlight - 1); waitQ.shift()?.(); };
const isBlocked = () => Date.now() < breakerUntil;

/** ⚠️ ยิงผ่าน proxy ของเราเสมอ — ห้ามใช้ host ของ RainViewer */
const frameTileUrl = (path: string, z: number, x: number, y: number, color = RV_SCHEME_DEFAULT) =>
  `/api/radar${path}/${SRC}/${z}/${x}/${y}/${color}/1_1.png`;

const loadTile = (url: string): Promise<ImageData | null> => {
  const hit = tileCache.get(url);
  if (hit) { touchCache(url, hit); return hit; }

  const neg = negCache.get(url);
  if (neg && Date.now() < neg) return Promise.resolve(null);
  if (neg) negCache.delete(url);

  const p = (async (): Promise<ImageData | null> => {
    if (isBlocked()) return null;
    await acquire();
    try {
      if (isBlocked()) return null;
      const res = await fetch(url, { cache: 'force-cache' });

      if (res.status === 429 || res.status === 503 || res.status === 502) {
        const ra = Number(res.headers.get('retry-after')) || 30;
        breakerUntil = Date.now() + Math.min(ra, 120) * 1000;   // หยุดยิงทั้งระบบชั่วคราว
        breakerTick++;
        negCache.set(url, Date.now() + NEG_TTL);
        return null;
      }
      if (!res.ok) { negCache.set(url, Date.now() + NEG_TTL); return null; }

      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      return ctx.getImageData(0, 0, c.width, c.height);
    } catch {
      negCache.set(url, Date.now() + NEG_TTL);
      return null;
    } finally { release(); }
  })();

  touchCache(url, p);
  p.then((d) => { if (!d) tileCache.delete(url); });   // ห้าม cache ความล้มเหลวถาวร
  return p;
};

const catmull = (t: number, a: number, b: number, c: number, d: number) =>
  b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* ═══════════════════ SMOOTH RADAR LAYER ═══════════════════ */
let SmoothLayerClass: any = null;
const getSmoothLayerClass = (L: any) => {
  if (SmoothLayerClass) return SmoothLayerClass;
  SmoothLayerClass = L.GridLayer.extend({
    options: {
      tileSize: SRC,                       // 512 → จำนวน tile ลดลง 4 เท่า
      colorScheme: RV_SCHEME_DEFAULT, quality: 'bicubic', gain: 1, cutoff: 6,
      updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 1,
    },

    createTile(coords: any, done: any) {
      const px = this.getTileSize().x;
      const canvas = L.DomUtil.create('canvas') as HTMLCanvasElement;
      canvas.width = px; canvas.height = px;
      canvas.style.width = `${px}px`;
      canvas.style.height = `${px}px`;
      this._render(coords, canvas, px).then(() => done(null, canvas)).catch((e: any) => done(e, canvas));
      return canvas;
    },

    async _render(coords: any, canvas: HTMLCanvasElement, out: number) {
      const { framePath, colorScheme, quality, gain, cutoff } = this.options;
      const z = coords.z - 1;              // grid 512px = standard tile ที่ z-1
      const ctx = canvas.getContext('2d')!;
      if (!framePath || z < 0) return;

      /* zoom ที่มีข้อมูลจริง → วาดตรง ๆ (gain ทำงานที่ path นี้ด้วย) */
      if (z <= NATIVE_Z) {
        const img = await loadTile(frameTileUrl(framePath, z, coords.x, coords.y, colorScheme));
        if (!img) return;

        const tmp = document.createElement('canvas');
        tmp.width = SRC; tmp.height = SRC;
        const tctx = tmp.getContext('2d')!;

        if (gain !== 1 || cutoff > 0) {
          const buf = new Uint8ClampedArray(img.data);      // copy — ห้ามแก้ของใน cache
          for (let i = 3; i < buf.length; i += 4) {
            const a = buf[i] * gain;
            buf[i] = a <= cutoff ? 0 : a > 255 ? 255 : a;
          }
          tctx.putImageData(new ImageData(buf, SRC, SRC), 0, 0);
        } else tctx.putImageData(img, 0, 0);

        ctx.imageSmoothingEnabled = true;
        (ctx as any).imageSmoothingQuality = 'high';
        ctx.drawImage(tmp, 0, 0, out, out);
        return;
      }

      /* zoom เกินข้อมูล → resample เอง */
      const scale = 1 << (z - NATIVE_Z);
      const n = 1 << NATIVE_Z;
      const gx0 = (coords.x * SRC) / scale;
      const gy0 = (coords.y * SRC) / scale;
      const span = SRC / scale;
      const pad = 2;

      const tx0 = Math.floor((gx0 - pad) / SRC), tx1 = Math.floor((gx0 + span + pad) / SRC);
      const ty0 = Math.floor((gy0 - pad) / SRC), ty1 = Math.floor((gy0 + span + pad) / SRC);

      const tiles = new Map<string, ImageData | null>();
      const jobs: Promise<void>[] = [];
      for (let tx = tx0; tx <= tx1; tx++)
        for (let ty = ty0; ty <= ty1; ty++) {
          const wx = ((tx % n) + n) % n, wy = clamp(ty, 0, n - 1);
          const key = `${wx}/${wy}`;
          if (tiles.has(key)) continue;
          tiles.set(key, null);
          jobs.push(loadTile(frameTileUrl(framePath, NATIVE_Z, wx, wy, colorScheme)).then((d) => { tiles.set(key, d); }));
        }
      await Promise.all(jobs);

      const px = (gx: number, gy: number, ch: number): number => {
        const fy = clamp(gy, 0, n * SRC - 1);
        let tx = Math.floor(gx / SRC);
        const ty = clamp(Math.floor(fy / SRC), 0, n - 1);
        tx = ((tx % n) + n) % n;
        const d = tiles.get(`${tx}/${ty}`);
        if (!d) return 0;
        const ix = clamp(((Math.floor(gx) % SRC) + SRC) % SRC, 0, SRC - 1);
        const iy = clamp(Math.floor(fy) - ty * SRC, 0, SRC - 1);
        const o = (iy * SRC + ix) * 4;
        const a = d.data[o + 3];
        return ch === 3 ? a : (d.data[o + ch] * a) / 255;
      };

      const outImg = ctx.createImageData(out, out);
      const O = outImg.data;
      const step = span / out;

      for (let oy = 0; oy < out; oy++) {
        const sy = gy0 + (oy + 0.5) * step - 0.5;
        const iy = Math.floor(sy), fy = sy - iy;
        for (let ox = 0; ox < out; ox++) {
          const sx = gx0 + (ox + 0.5) * step - 0.5;
          const ix = Math.floor(sx), fx = sx - ix;
          const o = (oy * out + ox) * 4;
          let r = 0, g = 0, b = 0, a = 0;

          if (quality === 'raw') {
            r = px(ix, iy, 0); g = px(ix, iy, 1); b = px(ix, iy, 2); a = px(ix, iy, 3);
          } else if (quality === 'bilinear') {
            for (let ch = 0; ch < 4; ch++) {
              const v = px(ix, iy, ch) * (1 - fx) * (1 - fy) + px(ix + 1, iy, ch) * fx * (1 - fy) +
                        px(ix, iy + 1, ch) * (1 - fx) * fy + px(ix + 1, iy + 1, ch) * fx * fy;
              if (ch === 0) r = v; else if (ch === 1) g = v; else if (ch === 2) b = v; else a = v;
            }
          } else {
            for (let ch = 0; ch < 4; ch++) {
              const col: number[] = [];
              for (let m = -1; m <= 2; m++)
                col.push(catmull(fx, px(ix - 1, iy + m, ch), px(ix, iy + m, ch), px(ix + 1, iy + m, ch), px(ix + 2, iy + m, ch)));
              const v = catmull(fy, col[0], col[1], col[2], col[3]);
              if (ch === 0) r = v; else if (ch === 1) g = v; else if (ch === 2) b = v; else a = v;
            }
          }

          const aRaw = clamp(a, 0, 255);
          const aOut = clamp(aRaw * gain, 0, 255);
          if (aOut <= cutoff || aRaw < 1) { O[o + 3] = 0; continue; }
          const inv = 255 / aRaw;
          O[o] = clamp(r * inv, 0, 255);
          O[o + 1] = clamp(g * inv, 0, 255);
          O[o + 2] = clamp(b * inv, 0, 255);
          O[o + 3] = aOut;
        }
      }
      ctx.putImageData(outImg, 0, 0);
    },
  });
  return SmoothLayerClass;
};

/* ─────────── React wrapper ─────────── */
function SmoothRadar({
  frame, frames = [], frameIndex = 0, enabled = true, opacity = 0.75,
  quality = 'bicubic', colorScheme = RV_SCHEME_DEFAULT, gain = 1, cutoff = 6, zIndex = 300,
}: {
  frame: RadarFrame | null; frames?: RadarFrame[]; frameIndex?: number; enabled?: boolean;
  opacity?: number; quality?: Quality; colorScheme?: number; gain?: number; cutoff?: number; zIndex?: number;
}) {
  const map = useMap();
  const currentRef = useRef<any>(null);
  const pendingRef = useRef<any>(null);

  /* prefetch: เฉพาะเฟรมใกล้เคียง + คำนวณพิกัดให้ตรง zoom จริง */
  useEffect(() => {
    if (!enabled || !frames.length || !map) return;
    let cancelled = false;

    const run = async () => {
      if (isBlocked()) return;
      const zz = Math.min(map.getZoom() - 1, NATIVE_Z);
      if (zz < 0) return;
      const b = map.getBounds();
      const nw = map.project(b.getNorthWest(), zz).divideBy(256);   // ← standard grid
      const se = map.project(b.getSouthEast(), zz).divideBy(256);
      const x0 = Math.floor(nw.x), x1 = Math.ceil(se.x);
      const y0 = Math.floor(nw.y), y1 = Math.ceil(se.y);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > PREFETCH_MAX_TILES) return;

      const lo = Math.max(0, frameIndex - PREFETCH_RADIUS);
      const hi = Math.min(frames.length - 1, frameIndex + PREFETCH_RADIUS);
      const urls: string[] = [];
      for (let fi = lo; fi <= hi; fi++)
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++)
            urls.push(frameTileUrl(frames[fi].path, zz, x, y, colorScheme));

      let i = 0;
      const w = async () => { while (i < urls.length && !cancelled && !isBlocked()) await loadTile(urls[i++]); };
      await Promise.all(Array.from({ length: 2 }, w));
    };

    const t = setTimeout(run, 900);
    return () => { cancelled = true; clearTimeout(t); };
  }, [frames, frameIndex, map, enabled, colorScheme]);

  useEffect(() => {
    if (!map) return;
    const L = require('leaflet');

    if (!enabled || !frame) {
      [currentRef, pendingRef].forEach((r) => { if (r.current) { try { map.removeLayer(r.current); } catch {} r.current = null; } });
      return;
    }
    if (pendingRef.current) { try { map.removeLayer(pendingRef.current); } catch {} pendingRef.current = null; }

    const Cls = getSmoothLayerClass(L);
    const next = new Cls({
      framePath: frame.path, colorScheme, quality, gain, cutoff,
      opacity: 0, zIndex: zIndex + 1, tileSize: SRC, maxZoom: 20, pane: 'overlayPane',
    });
    pendingRef.current = next;
    next.addTo(map);

    const reveal = () => {
      next.setZIndex(zIndex);
      next.setOpacity(opacity);
      if (currentRef.current && currentRef.current !== next) {
        const old = currentRef.current;
        old.setOpacity(0);
        setTimeout(() => { try { map.removeLayer(old); } catch {} }, 220);
      }
      currentRef.current = next;
      pendingRef.current = null;
    };
    next.on('load', reveal);
    const guard = setTimeout(reveal, 2000);
    return () => { clearTimeout(guard); next.off('load', reveal); };
  }, [map, frame?.path, enabled, quality, colorScheme, gain, cutoff, zIndex]);

  useEffect(() => { currentRef.current?.setOpacity(opacity); }, [opacity]);
  useEffect(() => () => {
    [currentRef, pendingRef].forEach((r) => { if (r.current) { try { map.removeLayer(r.current); } catch {} r.current = null; } });
  }, [map]);

  return null;
}

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

const polygonCentroid = (g: any): [number, number] => {
  const rings = ringsOf(g);
  let cx = 0, cy = 0, area = 0;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j], [x1, y1] = ring[i];
      const f = x0 * y1 - x1 * y0;
      area += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  if (Math.abs(area) < 1e-12) {
    const pts = rings.flat();
    if (!pts.length) return [98.3744, 18.1633];
    return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
};

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
const getNum = (p: any = {}, keys: string[]) => {
  for (const k of keys) { const v = Number(p?.[k]); if (!isNaN(v) && v > 0) return v; }
  return 0;
};
const getIdx = (f: any) => (f?.properties?.__idx ?? 0) as number;

/* ═══════════════════ เกณฑ์เตือนภัย ═══════════════════ */
const LEVELS = [
  { key: 'normal', name: 'ปกติ', max: 10, color: '#22C55E', glow: 'rgba(34,197,94,.8)', act: 'เฝ้าติดตามตามปกติ' },
  { key: 'watch', name: 'เฝ้าระวัง', max: 35, color: '#FACC15', glow: 'rgba(250,204,21,.8)', act: 'แจ้งผู้ใหญ่บ้าน ตรวจลำห้วย/ทางน้ำ' },
  { key: 'warn', name: 'เตือนภัย', max: 60, color: '#F97316', glow: 'rgba(249,115,22,.8)', act: 'ประกาศเสียงตามสาย เตรียมกลุ่มเปราะบาง' },
  { key: 'danger', name: 'อันตราย', max: 90, color: '#EF4444', glow: 'rgba(239,68,68,.9)', act: 'อพยพจุดเสี่ยงดินถล่ม/ริมห้วยทันที' },
  { key: 'crisis', name: 'วิกฤต', max: Infinity, color: '#A855F7', glow: 'rgba(168,85,247,.9)', act: 'อพยพเต็มรูปแบบไปจุดปลอดภัย' },
];
const classify = (idx: number) => LEVELS.find((l) => idx < l.max) || LEVELS[LEVELS.length - 1];

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

/* ═══════════════════════════ PAGE ═══════════════════════════ */
export default function RadarPage() {
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [radarData, setRadarData] = useState<any>(null);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);        // เริ่มแบบหยุด กันยิง tile รัวตอนเปิดหน้า
  const [speed, setSpeed] = useState(1000);
  const [blockedNow, setBlockedNow] = useState(false);

  const [mapStyle, setMapStyle] = useState<BasemapId>('satellite');
  const [showRadar, setShowRadar] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.72);
  const [radarQuality, setRadarQuality] = useState<Quality>('bicubic');
  const [radarGain, setRadarGain] = useState(1);
  const [colorScheme, setColorScheme] = useState(RV_SCHEME_DEFAULT);
  const [showBoluang, setShowBoluang] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

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

  const [isTopHeaderVisible, setIsTopHeaderVisible] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [realStats, setRealStats] = useState({ totalVisits: 0, totalUniqueVisitors: 0, todayVisits: 0, todayUniqueVisitors: 0, isLoading: true });

  const mapRef = useRef<any>(null);
  const fcAbortRef = useRef<AbortController | null>(null);
  const center = { lat: 18.1633, lng: 98.3744 };

  useEffect(() => { if (LOW_MEM) setRadarQuality('bilinear'); }, []);

  /* เฝ้าสถานะ rate-limit */
  useEffect(() => {
    const t = setInterval(() => setBlockedNow(isBlocked()), 1000);
    return () => clearInterval(t);
  }, []);

  /* หยุดเล่นอัตโนมัติเมื่อโดนจำกัด */
  useEffect(() => { if (blockedNow && isPlaying) setIsPlaying(false); }, [blockedNow, isPlaying]);

  /* โหลด GeoJSON + รายการเฟรมเรดาร์ */
  useEffect(() => {
    fetch('/geojson/boluang.json').then((r) => r.json()).then(setGeoBoluang).catch(() => {});
    fetch('/geojson/block.json').then((r) => r.json()).then((d) => {
      (d?.features || []).forEach((f: any, i: number) => { f.properties = { ...(f.properties || {}), __idx: i }; });
      setGeoBlock(d);
    }).catch(() => {});

    const loadRadar = () =>
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then((r) => r.json())
        .then((d) => {
          const frames: RadarFrame[] = [...(d.radar.past || []), ...(d.radar.nowcast || [])];
          pruneTileCache(frames.map((f) => f.path));
          setRadarData({ frames, pastCount: d.radar.past.length });
          setCurrentFrameIndex((prev) => (prev === 0 ? d.radar.past.length - 1 : Math.min(prev, frames.length - 1)));
        })
        .catch(console.error);

    loadRadar();
    const t = setInterval(loadRadar, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  /* ความเสี่ยงรายหมู่บ้าน */
  const computeVillageRisk = useCallback(async (fc: any) => {
    const feats: any[] = fc?.features || [];
    if (!feats.length) return;
    setRiskLoading(true);
    try {
      const cents = feats.map((f) => polygonCentroid(f.geometry));
      const lat = cents.map((c) => c[1].toFixed(4)).join(',');
      const lon = cents.map((c) => c[0].toFixed(4)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,precipitation_probability&daily=precipitation_sum&past_days=7&forecast_days=2&timezone=Asia%2FBangkok`;
      const raw = await (await fetch(url)).json();
      const arr = Array.isArray(raw) ? raw : [raw];
      const now = Date.now();

      const rows = feats.map((f, i) => {
        const d = arr[i] || arr[0];
        const props = f.properties || {};
        const times: string[] = d?.hourly?.time || [];
        const prec: number[] = d?.hourly?.precipitation || [];
        const prob: number[] = d?.hourly?.precipitation_probability || [];

        let idx = times.findIndex((t) => new Date(`${t}:00+07:00`).getTime() >= now);
        if (idx < 0) idx = Math.max(times.length - 4, 0);

        const hours = [1, 2, 3].map((k) => ({
          time: times[idx + k] ? new Date(`${times[idx + k]}:00+07:00`) : null,
          rain: prec[idx + k] ?? 0, prob: prob[idx + k] ?? 0,
        }));

        const rain3h = hours.reduce((s, h) => s + (h.rain || 0), 0);
        const rain1h = prec[idx] ?? 0;
        const rain24h = prec.slice(Math.max(idx - 24, 0), idx).reduce((s, v) => s + (v || 0), 0);
        const maxProb = Math.max(0, ...hours.map((h) => h.prob || 0));
        const peakHour = hours.reduce((a, b) => ((b.rain || 0) > (a.rain || 0) ? b : a), hours[0]);

        const daily: number[] = (d?.daily?.precipitation_sum || []).slice(0, 7);
        const api7 = daily.reduce((acc: number, v: number) => acc * 0.9 + (v || 0), 0);
        const soilFactor = 1 + Math.min(api7 / 120, 0.5);
        const slope = getNum(props, ['slope_deg', 'slope', 'SLOPE']);
        const terrainFactor = slope > 20 ? 1.25 : slope > 12 ? 1.1 : 1.0;
        const riskIndex = rain3h * soilFactor * terrainFactor;

        return {
          id: `${i}`, moo: getMoo(props, i), name: getName(props, i),
          households: getNum(props, ['households', 'house', 'HOUSE', 'hh']),
          population: getNum(props, ['population', 'pop', 'POP']),
          centroid: cents[i], rain1h, rain3h, rain24h, maxProb, api7, soilFactor, terrainFactor,
          riskIndex, level: classify(riskIndex), peak: fmtTime(peakHour?.time), hours, raw: props,
        };
      });

      rows.sort((a, b) => b.riskIndex - a.riskIndex);
      setVillageRisk(rows);
      setRiskUpdatedAt(new Date());
    } catch (e) { console.error('village risk error', e); }
    finally { setRiskLoading(false); }
  }, []);

  useEffect(() => {
    if (!geoBlock) return;
    computeVillageRisk(geoBlock);
    const t = setInterval(() => computeVillageRisk(geoBlock), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [geoBlock, computeVillageRisk]);

  const riskByIdx = useMemo(() => {
    const m = new Map<number, any>();
    villageRisk.forEach((v) => m.set(Number(v.id), v));
    return m;
  }, [villageRisk]);

  const tambonSummary = useMemo(() => {
    if (!villageRisk.length) return null;
    const mean = villageRisk.reduce((s, v) => s + v.rain3h, 0) / villageRisk.length;
    const peak = Math.max(...villageRisk.map((v) => v.rain3h));
    const affected = villageRisk.filter((v) => v.rain3h > 1).length;
    return { mean, peak, affected, worst: villageRisk[0], pctArea: Math.round((affected / villageRisk.length) * 100), level: classify(villageRisk[0].riskIndex) };
  }, [villageRisk]);

  const alertVillages = useMemo(() => villageRisk.filter((v) => ['warn', 'danger', 'crisis'].includes(v.level.key)), [villageRisk]);
  const alertSig = useMemo(() => alertVillages.map((v) => `${v.id}:${v.level.key}`).join('|'), [alertVillages]);
  const showAlert = alertVillages.length > 0 && alertSig !== dismissedSig;

  /* สถิติผ่าน RPC */
  useEffect(() => {
    if (!isStatsModalOpen) return;
    (async () => {
      setRealStats((p) => ({ ...p, isLoading: true }));
      try {
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
        if (isBlocked()) return;
        setCurrentFrameIndex((p) => (p + 1 >= radarData.frames.length ? 0 : p + 1));
      }, speed);
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
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&timezone=Asia%2FBangkok&forecast_days=2`,
        { signal: ac.signal }
      );
      const d = await r.json();
      const now = Date.now();
      let idx = d.hourly.time.findIndex((t: string) => new Date(`${t}:00+07:00`).getTime() >= now);
      if (idx < 0) idx = 0;
      const hours = [1, 2, 3].map((k) => ({
        time: d.hourly.time[idx + k] ? new Date(`${d.hourly.time[idx + k]}:00+07:00`) : null,
        rain: d.hourly.precipitation[idx + k] ?? 0,
      }));
      const total = hours.reduce((s, h) => s + h.rain, 0);
      if (!ac.signal.aborted) setForecastData({ isRaining: total > 0.5, totalRain: total, hours });
    } catch (e: any) { if (e?.name !== 'AbortError') console.error(e); }
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
        `<div><b>${name}</b>${v ? ` · <span style="color:${v.level.color}">${v.rain3h.toFixed(1)} มม.</span>` : ''}</div>`,
        { permanent: showRisk, direction: 'center', className: 'village-label' }
      );
    layer.off('click');
    layer.on('click', (e: any) => { e?.originalEvent?.stopPropagation?.(); if (v) flyToVillage(v); });
  }, [riskByIdx, showLabels, showRisk, flyToVillage]);

  const activeFrame: RadarFrame | null = radarData?.frames?.[currentFrameIndex] || null;
  const isNowcast = currentFrameIndex >= (radarData?.pastCount || 0);
  const latestPast = radarData?.frames?.[(radarData?.pastCount || 1) - 1];
  const minutesAgo = latestPast ? Math.round((Date.now() - latestPast.time * 1000) / 60000) : null;
  const frameOffset = radarData ? (currentFrameIndex - (radarData.pastCount - 1)) * 10 : 0;
  const isStale = minutesAgo != null && minutesAgo > STALE_MINUTES;
  const bm = BASEMAPS[mapStyle];

  /* ═══════════ UI PARTS ═══════════ */
  const LayerToggle = ({ label, checked, onChange, badge }: any) => (
    <div className="flex items-center justify-between group py-1">
      <label className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0">
        <input type="checkbox" checked={checked} onChange={onChange} className="onwr-checkbox shrink-0" />
        <span className="text-[12px] font-medium text-[#D1D5DB] group-hover:text-white truncate">{label}</span>
      </label>
      {badge && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#4178F3]/15 text-[#4178F3] border border-[#4178F3]/30 font-bold shrink-0 ml-2">{badge}</span>}
    </div>
  );

  const RankTable = ({ height = 'h-[320px]' }: any) => (
    <div className="w-full text-[11.5px]">
      <div className="flex font-bold text-[#8B94A5] border-b border-[#333946] pb-2.5 mb-1">
        <div className="w-7 text-center">#</div><div className="w-1.5 mr-2" />
        <div className="flex-1 pl-1">หมู่บ้าน</div>
        <div className="w-14 text-right text-[#4178F3]">ฝน 3 ชม.</div>
        <div className="w-12 text-right">ดัชนี</div>
        <div className="w-12 text-right pr-1">Peak</div>
      </div>
      <div className={`overflow-y-auto ${height} onwr-scroll pr-2`}>
        {riskLoading && !villageRisk.length ? (
          <div className="py-10 text-center text-[#8B94A5] text-[12px] animate-pulse">กำลังประมวลผลรายหมู่บ้าน...</div>
        ) : villageRisk.length ? (
          villageRisk.map((v, i) => (
            <div key={v.id} onClick={() => flyToVillage(v)}
              className={`flex items-center text-[#D1D5DB] py-2.5 border-b border-[#333946]/30 hover:bg-[#232732] cursor-pointer rounded px-1 transition-colors ${selectedVillage?.id === v.id ? 'bg-[#232732] ring-1 ring-[#4178F3]/40' : ''}`}>
              <div className="w-7 text-center text-[#8B94A5] font-mono">{i + 1}</div>
              <div className="w-1.5 h-6 rounded-full mr-2 shrink-0" style={{ background: v.level.color, boxShadow: `0 0 8px ${v.level.glow}` }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[#E5E7EB] truncate">{v.name}</div>
                <div className="text-[9.5px] text-[#8B94A5] font-mono">หมู่ {v.moo} · {v.level.name}</div>
              </div>
              <div className="w-14 text-right font-mono text-white font-bold">{v.rain3h.toFixed(1)}</div>
              <div className="w-12 text-right font-mono text-[#8B94A5]">{v.riskIndex.toFixed(1)}</div>
              <div className="w-12 text-right font-mono pr-1">{v.peak}</div>
            </div>
          ))
        ) : (
          <div className="py-10 text-center text-[#8B94A5] text-[12px]">ไม่พบข้อมูล /geojson/block.json</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative w-screen h-screen bg-[#111319] overflow-hidden font-sans text-white flex flex-col select-none">
      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container { background:#111319 !important; }
        .leaflet-tile-pane, .leaflet-overlay-pane { cursor:crosshair; }
        .leaflet-control-attribution { background:rgba(17,19,25,.78) !important; color:#8B94A5 !important; font-size:9px !important; padding:2px 6px !important; border-radius:6px 0 0 0 !important; }
        .leaflet-control-attribution a { color:#4178F3 !important; }
        .onwr-panel { background:#1A1D24; border:1px solid #333946; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.7); }
        .onwr-checkbox { appearance:none; width:14px; height:14px; border:2px solid #4B5563; border-radius:4px; background:transparent; cursor:pointer; position:relative; transition:.2s; }
        .onwr-checkbox:checked { background:#4178F3; border-color:#4178F3; }
        .onwr-checkbox:checked::after { content:''; position:absolute; left:3.5px; top:.5px; width:4px; height:8px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
        .onwr-slider { -webkit-appearance:none; width:100%; height:4px; background:#333946; border-radius:2px; outline:none; }
        .onwr-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#4178F3; cursor:pointer; border:2px solid #1A1D24; box-shadow:0 0 8px rgba(65,120,243,.8); }
        .onwr-scroll::-webkit-scrollbar { width:6px; }
        .onwr-scroll::-webkit-scrollbar-track { background:#111319; border-radius:4px; }
        .onwr-scroll::-webkit-scrollbar-thumb { background:#333946; border-radius:4px; }
        .village-label { background:rgba(17,19,25,.85) !important; border:1px solid #333946 !important; color:#E5E7EB !important; font-size:10px !important; padding:2px 6px !important; border-radius:6px !important; box-shadow:none !important; }
        .village-label::before { display:none !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        .animate-fade-in { animation: fadeIn .25s ease-out; }
      `}} />

      {/* ══ TOP BAR ══ */}
      <div className="absolute top-0 left-0 w-full h-8 z-[1999]" onMouseEnter={() => setIsTopHeaderVisible(true)} />
      <header
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-[98%] max-w-[1200px] h-[76px] bg-[#1A1D24]/92 backdrop-blur-xl rounded-b-2xl z-[2000] flex items-center justify-between px-6 shadow-[0_15px_50px_rgba(0,0,0,.6)] transition-transform duration-500 border-b border-x border-[#333946] ${isTopHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}
        onMouseLeave={() => setIsTopHeaderVisible(false)}>
        <div className="flex items-center space-x-4">
          <div className="w-11 h-11 bg-[#111319] rounded-full border border-[#333946] flex items-center justify-center p-1.5">
            <img src="/Logogis3.png" alt="Logo" className="w-full h-full object-contain opacity-90" />
          </div>
          <div>
            <h1 className="text-[15px] font-extrabold tracking-wide text-[#E5E7EB]">
              RADAR COMPOSITE <span className="text-[#4178F3] mx-1">•</span>
              <span className="font-medium text-[#D1D5DB]">NOWCAST 3 ชม. รายหมู่บ้าน</span>
            </h1>
            <p className="text-[11px] text-[#8B94A5] mt-1 font-mono">เทศบาลตำบลบ่อหลวง อ.ฮอด จ.เชียงใหม่</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="hidden lg:flex items-center space-x-2">
            <span className="text-[#8B94A5] font-bold text-[11px] uppercase">อัปเดต</span>
            <div className="px-3 py-1.5 bg-[#111319] border border-[#333946] text-[#4178F3] rounded-lg font-mono font-bold text-[12px]">{fmtTime(riskUpdatedAt)} น.</div>
          </div>
          <button onClick={() => geoBlock && computeVillageRisk(geoBlock)} className="flex items-center px-4 py-2 bg-[#232732] border border-[#333946] text-[#D1D5DB] hover:bg-[#2D323B] rounded-xl font-bold space-x-2">
            <svg className={`w-4 h-4 ${riskLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M19.418 9A7.003 7.003 0 006 7.293M4.582 15A7.003 7.003 0 0018 16.707" /></svg>
            <span className="text-[12px]">รีเฟรช</span>
          </button>
          <button onClick={() => setIsStatsModalOpen(true)} className="flex items-center px-4 py-2 bg-[#4178F3]/10 border border-[#4178F3]/30 text-[#4178F3] hover:bg-[#4178F3]/20 rounded-xl font-bold space-x-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2-2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="text-[12px]">สถิติ</span>
          </button>
        </div>
      </header>
      {!isTopHeaderVisible && (
        <button onClick={() => setIsTopHeaderVisible(true)} onMouseEnter={() => setIsTopHeaderVisible(true)}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#1A1D24]/80 backdrop-blur-md rounded-b-xl border-b border-x border-[#333946] flex items-center justify-center cursor-pointer z-[1500] hover:bg-[#232732]">
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
              enabled={showRadar} opacity={radarOpacity} quality={radarQuality}
              colorScheme={colorScheme} gain={radarGain} cutoff={6} zIndex={300}
            />
            {showBoluang && geoBoluang && <GeoJSON data={geoBoluang} style={{ color: '#FFFFFF', weight: 2, fill: false, opacity: 0.9, dashArray: '5,5' }} />}
            {showBlock && geoBlock && (
              <GeoJSON key={`blk-${villageRisk.length}-${showRisk}-${showLabels}-${riskUpdatedAt?.getTime()}-${selectedVillage?.id ?? 'x'}`}
                data={geoBlock} style={blockStyle as any} onEachFeature={onEachBlock} />
            )}
            <ClickableMap onMapClick={handleMapClick} />
            {clickedLocation && customPinIcon && <Marker position={[clickedLocation.lat, clickedLocation.lng]} icon={customPinIcon} />}
          </MapContainer>
        </div>

        {/* ══ ALERT BANNER ══ */}
        {showAlert && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1400] w-[92%] max-w-[640px] animate-fade-in">
            <div className="rounded-2xl border px-4 py-3 flex items-center gap-3 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,.6)]"
              style={{ background: 'rgba(26,29,36,.93)', borderColor: alertVillages[0].level.color }}>
              <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: alertVillages[0].level.color, boxShadow: `0 0 12px ${alertVillages[0].level.glow}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-extrabold" style={{ color: alertVillages[0].level.color }}>
                  ⚠️ {alertVillages[0].level.name} — {alertVillages.length} หมู่บ้านเสี่ยงใน 3 ชม. ข้างหน้า
                </div>
                <div className="text-[11px] text-[#D1D5DB] truncate mt-0.5">
                  {alertVillages.slice(0, 3).map((v) => `${v.name} ${v.rain3h.toFixed(0)} มม.`).join(' · ')}
                  {alertVillages.length > 3 ? ` และอีก ${alertVillages.length - 3} แห่ง` : ''} — {alertVillages[0].level.act}
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
          <div className="absolute top-5 left-5 z-[1000] w-[292px] onwr-panel flex-col hidden md:flex">
            <div className="px-5 py-3.5 border-b border-[#333946] flex justify-between items-center bg-[#232732] rounded-t-xl">
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

              <div className="p-4 overflow-y-auto onwr-scroll pr-2 rounded-b-xl">
                <LayerToggle label="เรดาร์คอมโพสิต" checked={showRadar} onChange={(e: any) => setShowRadar(e.target.checked)} badge="LIVE" />
                <div className="pl-7 pr-1 pb-3 pt-1.5 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความทึบ</span>
                    <input type="range" min="0.2" max="1" step="0.05" value={radarOpacity} onChange={(e) => setRadarOpacity(parseFloat(e.target.value))} className="onwr-slider flex-1" />
                    <span className="text-[9.5px] font-mono text-[#4178F3] w-[26px] text-right">{Math.round(radarOpacity * 100)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความคม</span>
                    <div className="flex bg-[#111319] rounded border border-[#333946] overflow-hidden flex-1">
                      {([{ k: 'bicubic', t: 'สูงสุด' }, { k: 'bilinear', t: 'สมดุล' }, { k: 'raw', t: 'ประหยัด' }] as const).map((o) => (
                        <button key={o.k} onClick={() => setRadarQuality(o.k)}
                          className={`flex-1 py-1 text-[9.5px] font-bold transition-colors ${radarQuality === o.k ? 'bg-[#4178F3]/20 text-[#4178F3]' : 'text-[#8B94A5] hover:bg-[#2D323B]'}`}>{o.t}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#8B94A5] w-[48px] shrink-0">ความเข้ม</span>
                    <input type="range" min="0.6" max="1.8" step="0.05" value={radarGain} onChange={(e) => setRadarGain(parseFloat(e.target.value))} className="onwr-slider flex-1" />
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

                <LayerToggle label="ฝนสะสมคาดการณ์ 3 ชม. (รายหมู่บ้าน)" checked={showRisk} onChange={(e: any) => setShowRisk(e.target.checked)} badge="NOWCAST" />
                <LayerToggle label="ป้ายชื่อหมู่บ้าน" checked={showLabels} onChange={(e: any) => setShowLabels(e.target.checked)} />
                <div className="border-t border-[#333946] my-3" />
                <LayerToggle label="ขอบเขตตำบลบ่อหลวง" checked={showBoluang} onChange={(e: any) => setShowBoluang(e.target.checked)} />
                <LayerToggle label={`ขอบเขตหมู่บ้าน (${geoBlock?.features?.length || 0} โซน)`} checked={showBlock} onChange={(e: any) => setShowBlock(e.target.checked)} />
                <LayerToggle label="คำอธิบายสัญลักษณ์" checked={isLegendOpen} onChange={(e: any) => setIsLegendOpen(e.target.checked)} />
                <div className="mt-3 text-[10px] text-[#8B94A5] leading-relaxed bg-[#111319] border border-[#333946] rounded-lg p-2.5">
                  ดัชนีเสี่ยง = <b className="text-[#D1D5DB]">ฝนคาด 3 ชม. × ดินอิ่มน้ำ × ความลาดชัน</b>
                </div>
                <div className="mt-2 text-[9px] text-[#8B94A5] leading-relaxed">
                  เรดาร์: RainViewer · พยากรณ์: Open-Meteo · แผนที่ฐาน: Esri / CARTO / OSM
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
          <div className="absolute top-5 right-5 z-[900] w-[398px] onwr-panel flex-col hidden xl:flex overflow-hidden">
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
                    ดินอิ่มน้ำ (API) เฉลี่ย: <b className="text-[#D1D5DB] font-mono">{(villageRisk.reduce((s, v) => s + v.api7, 0) / (villageRisk.length || 1)).toFixed(0)} มม.</b>
                    {' '}(×{(villageRisk.reduce((s, v) => s + v.soilFactor, 0) / (villageRisk.length || 1)).toFixed(2)})
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
          <div className="absolute top-24 right-5 xl:right-[420px] z-[1050] w-[326px] onwr-panel animate-fade-in hidden md:block" style={{ borderColor: `${selectedVillage.level.color}66` }}>
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
                    <p className="text-[16px] font-black font-mono text-[#E5E7EB] mt-0.5">{s.v.toFixed(1)}</p>
                    <p className="text-[8.5px] text-[#8B94A5]">มม.</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#8B94A5] mb-2">พยากรณ์รายชั่วโมง</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {selectedVillage.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className="text-[10px] font-mono text-[#E5E7EB]">{fmtTime(h.time)}</div>
                        <div className={`text-[10px] font-bold mt-0.5 ${r.color}`}>{h.rain.toFixed(1)} มม.</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border p-3" style={{ borderColor: selectedVillage.level.color, background: `${selectedVillage.level.color}12` }}>
                <p className="text-[11.5px] font-bold" style={{ color: selectedVillage.level.color }}>แนวปฏิบัติ</p>
                <p className="text-[11px] text-[#D1D5DB] mt-1">{selectedVillage.level.act}</p>
              </div>
              <div className="text-[10px] text-[#8B94A5] font-mono grid grid-cols-2 gap-y-1 border-t border-[#333946] pt-3">
                <span>ดินอิ่มน้ำ (API)</span><span className="text-right text-[#D1D5DB]">{selectedVillage.api7.toFixed(0)} มม. (×{selectedVillage.soilFactor.toFixed(2)})</span>
                <span>ดัชนีเสี่ยงรวม</span><span className="text-right text-[#D1D5DB]">{selectedVillage.riskIndex.toFixed(1)}</span>
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
          <div className="absolute top-24 right-5 xl:right-[420px] z-[1040] w-[318px] onwr-panel animate-fade-in hidden md:block">
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
              ) : forecastData ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {forecastData.hours.map((h: any, i: number) => {
                    const r = getRainText(h.rain);
                    return (
                      <div key={i} className="bg-[#232732] border border-[#333946] rounded-xl p-2.5 text-center">
                        <span className="text-[9px] text-[#8B94A5] font-bold">+{i + 1} ชม.</span>
                        <div className="text-[18px] my-0.5">{r.icon}</div>
                        <div className="text-[9.5px] font-mono text-[#8B94A5]">{fmtTime(h.time)}</div>
                        <div className={`text-[10px] font-bold ${r.color}`}>{h.rain.toFixed(1)} มม.</div>
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
          <div className="absolute bottom-8 left-5 z-[900] onwr-panel px-3 py-3 w-[188px] bg-[#1A1D24]/95 backdrop-blur-md hidden lg:block">
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
          <div className="onwr-panel bg-[#1A1D24]/96 backdrop-blur-md overflow-hidden">
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
                className={`text-[#E5E7EB] hover:text-[#4178F3] bg-[#232732] p-1.5 rounded-full border border-[#333946] shrink-0 ${blockedNow ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {isPlaying ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
              </button>
              <div className="flex-1 relative flex items-center h-8">
                <input type="range" min="0" max={(radarData?.frames?.length || 1) - 1} value={currentFrameIndex}
                  onChange={(e) => { setIsPlaying(false); setCurrentFrameIndex(parseInt(e.target.value)); }} className="w-full onwr-slider z-10" />
                {radarData && <div className="absolute h-4 w-[2px] bg-[#F59E0B] z-0 rounded-full" style={{ left: `${((radarData.pastCount - 1) / (radarData.frames.length - 1)) * 100}%` }} />}
              </div>
              <button onClick={() => { setIsPlaying(false); setCurrentFrameIndex((radarData?.pastCount || 1) - 1); }}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded border border-[#333946] text-[#4178F3] hover:bg-[#232732] shrink-0">T+0</button>
              <span className="text-[10px] font-mono text-[#8B94A5] shrink-0">{currentFrameIndex + 1}/{radarData?.frames?.length || 0}</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="bg-[#111319] border border-[#333946] text-[#8B94A5] text-[10px] rounded px-1.5 py-1 outline-none shrink-0">
                <option value={1600}>0.5x</option><option value={1000}>1x</option><option value={600}>2x</option><option value={350}>3x</option>
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
          </div>
        </div>

        {/* ══ MOBILE SHEET ══ */}
        <div className={`md:hidden absolute left-0 right-0 bottom-0 z-[1200] transition-transform duration-300 ${isSheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-72px)]'}`}>
          <div className="bg-[#1A1D24]/97 backdrop-blur-xl border-t border-[#333946] rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,.7)] max-h-[74vh] flex flex-col">
            <div onClick={() => setIsSheetOpen(!isSheetOpen)} className="py-3 px-5 cursor-pointer">
              <div className="w-10 h-1 bg-[#4B5563] rounded-full mx-auto mb-2.5" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ background: villageRisk[0]?.level.color || '#4178F3' }} />
                  <span className="text-[12.5px] font-bold text-[#E5E7EB] truncate">
                    {villageRisk.length ? `เสี่ยงสุด: ${villageRisk[0].name} ${villageRisk[0].rain3h.toFixed(1)} มม.` : 'กำลังประมวลผล...'}
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
                <button onClick={() => geoBlock && computeVillageRisk(geoBlock)} className="flex-1 py-2 rounded-lg text-[11px] font-bold border border-[#333946] text-[#D1D5DB]">รีเฟรช</button>
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
