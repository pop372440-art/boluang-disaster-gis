'use client';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { smoothRadarLayer, prefetchFrames, NATIVE_Z, type RadarFrame, type Quality } from './smoothRadar';

type Props = {
  host: string;
  frame: RadarFrame | null;
  frames?: RadarFrame[];
  opacity?: number;
  quality?: Quality;
  colorScheme?: number;
  gain?: number;
  cutoff?: number;
  zIndex?: number;
  enabled?: boolean;
};

export default function SmoothRadar({
  host, frame, frames = [], opacity = 0.75, quality = 'bicubic',
  colorScheme = 4, gain = 1, cutoff = 6, zIndex = 300, enabled = true,
}: Props) {
  const map = useMap();
  const currentRef = useRef<any>(null);
  const pendingRef = useRef<any>(null);

  /* preload ทุกเฟรมรอบพื้นที่ที่มองเห็น */
  useEffect(() => {
    if (!enabled || !host || !frames.length || !map) return;
    const b = map.getBounds();
    const z = Math.min(map.getZoom(), NATIVE_Z);
    const nw = map.project(b.getNorthWest(), z).divideBy(512);
    const se = map.project(b.getSouthEast(), z).divideBy(512);
    prefetchFrames(host, frames, z, {
      minX: Math.floor(nw.x) - 1, maxX: Math.ceil(se.x) + 1,
      minY: Math.floor(nw.y) - 1, maxY: Math.ceil(se.y) + 1,
    }).catch(() => {});
  }, [host, frames, map, enabled]);

  /* สลับเฟรมแบบ cross-fade */
  useEffect(() => {
    if (!map) return;

    if (!enabled || !frame || !host) {
      [currentRef, pendingRef].forEach((r) => { if (r.current) { map.removeLayer(r.current); r.current = null; } });
      return;
    }

    if (pendingRef.current) { map.removeLayer(pendingRef.current); pendingRef.current = null; }

    const next = smoothRadarLayer({
      host, framePath: frame.path, colorScheme, quality, gain, cutoff,
      opacity: 0, zIndex: zIndex + 1, tileSize: 256, maxZoom: 20, pane: 'overlayPane',
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
    const guard = setTimeout(reveal, 1400);   // กันกรณี event ไม่ยิง
    return () => { clearTimeout(guard); next.off('load', reveal); };
  }, [map, host, frame?.path, enabled, quality, colorScheme, gain, cutoff, zIndex]);

  /* ปรับ opacity สด ๆ */
  useEffect(() => { currentRef.current?.setOpacity(opacity); }, [opacity]);

  useEffect(() => () => {
    [currentRef, pendingRef].forEach((r) => { if (r.current) { try { map.removeLayer(r.current); } catch {} r.current = null; } });
  }, [map]);

  return null;
}
