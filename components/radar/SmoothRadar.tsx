'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { RadarFrame } from '@/lib/radar/types';
import {
  DEFAULT_COLOR_SCHEME,
  frameTileUrl,
  isRadarTileBlocked,
  loadRadarTile,
  NATIVE_ZOOM,
  SOURCE_TILE_SIZE,
  type RadarQuality,
} from './radarClientCache';
import { createSmoothRadarLayer } from './smoothRadar';

type Props = {
  frame: RadarFrame | null;
  frames?: RadarFrame[];
  frameIndex?: number;
  opacity?: number;
  quality?: RadarQuality;
  colorScheme?: number;
  gain?: number;
  cutoff?: number;
  zIndex?: number;
  enabled?: boolean;
};

export default function SmoothRadar({
  frame, frames = [], frameIndex = 0, opacity = 0.75, quality = 'bilinear',
  colorScheme = DEFAULT_COLOR_SCHEME, gain = 1, cutoff = 6, zIndex = 300, enabled = true,
}: Props) {
  const map = useMap();
  const currentRef = useRef<any>(null);
  const pendingRef = useRef<any>(null);
  const frameAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !frames.length || !map || isRadarTileBlocked()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const zoom = Math.min(map.getZoom() - 1, NATIVE_ZOOM);
      if (zoom < 0) return;
      const bounds = map.getBounds();
      const northwest = map.project(bounds.getNorthWest(), zoom).divideBy(256);
      const southeast = map.project(bounds.getSouthEast(), zoom).divideBy(256);
      const minX = Math.floor(northwest.x);
      const maxX = Math.ceil(southeast.x);
      const minY = Math.floor(northwest.y);
      const maxY = Math.ceil(southeast.y);
      if ((maxX - minX + 1) * (maxY - minY + 1) > 16) return;
      const adjacent = [frameIndex - 1, frameIndex + 1]
        .filter((index) => index >= 0 && index < frames.length)
        .map((index) => frames[index]);
      const urls = adjacent.flatMap((adjacentFrame) => {
        const frameUrls: string[] = [];
        for (let x = minX; x <= maxX; x += 1) {
          for (let y = minY; y <= maxY; y += 1) {
            frameUrls.push(frameTileUrl(adjacentFrame.path, zoom, x, y, colorScheme));
          }
        }
        return frameUrls;
      });
      let index = 0;
      const worker = async () => {
        while (index < urls.length && !controller.signal.aborted) {
          await loadRadarTile(urls[index++], controller.signal);
        }
      };
      await Promise.all([worker(), worker()]);
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [colorScheme, enabled, frameIndex, frames, map]);

  useEffect(() => {
    frameAbortRef.current?.abort();
    const controller = new AbortController();
    frameAbortRef.current = controller;
    if (!enabled || !frame) {
      [currentRef, pendingRef].forEach((reference) => {
        if (reference.current && map.hasLayer(reference.current)) map.removeLayer(reference.current);
        reference.current = null;
      });
      return () => controller.abort();
    }

    if (pendingRef.current && map.hasLayer(pendingRef.current)) map.removeLayer(pendingRef.current);
    const next = createSmoothRadarLayer({
      framePath: frame.path, requestSignal: controller.signal, colorScheme, quality, gain, cutoff,
      opacity: 0, zIndex: zIndex + 1, tileSize: SOURCE_TILE_SIZE, maxZoom: 20, pane: 'overlayPane',
    });
    pendingRef.current = next;
    next.addTo(map);
    const reveal = () => {
      if (controller.signal.aborted) return;
      next.setZIndex(zIndex);
      next.setOpacity(opacity);
      if (currentRef.current && currentRef.current !== next) {
        const previous = currentRef.current;
        previous.setOpacity(0);
        window.setTimeout(() => map.hasLayer(previous) && map.removeLayer(previous), 180);
      }
      currentRef.current = next;
      pendingRef.current = null;
    };
    next.on('load', reveal);
    const guard = window.setTimeout(reveal, 2_000);
    return () => {
      controller.abort();
      window.clearTimeout(guard);
      next.off('load', reveal);
      if (map.hasLayer(next) && next !== currentRef.current) map.removeLayer(next);
    };
  }, [colorScheme, cutoff, enabled, frame?.path, gain, map, opacity, quality, zIndex]);

  useEffect(() => { currentRef.current?.setOpacity(opacity); }, [opacity]);
  useEffect(() => () => {
    frameAbortRef.current?.abort();
    [currentRef, pendingRef].forEach((reference) => {
      if (reference.current && map.hasLayer(reference.current)) map.removeLayer(reference.current);
      reference.current = null;
    });
  }, [map]);
  return null;
}
