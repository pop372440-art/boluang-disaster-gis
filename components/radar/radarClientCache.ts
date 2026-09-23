'use client';

import { RadarFrameCache } from '@/lib/radar/radar-frame-cache';
import { RAINVIEWER_NATIVE_ZOOM } from '@/lib/radar/radar-tile-proxy';
import {
  selectAutomaticRadarQuality,
  type RadarQuality,
} from '@/lib/radar/radar-render-policy';

export const SOURCE_TILE_SIZE = 512;
// RainViewer radar tiles provide native imagery through zoom 7. Higher map
// zooms reuse and resample z7 tiles so provider error artwork is never drawn.
export const NATIVE_ZOOM = RAINVIEWER_NATIVE_ZOOM;
export const DEFAULT_COLOR_SCHEME = 4;
export type { RadarQuality } from '@/lib/radar/radar-render-policy';

export function detectRadarQuality(): RadarQuality {
  if (typeof window === 'undefined') return 'bilinear';
  const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4);
  const cores = Number(navigator.hardwareConcurrency ?? 4);
  return selectAutomaticRadarQuality({
    width: window.innerWidth,
    memoryGb: memory,
    logicalCores: cores,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
}

const cache = new RadarFrameCache<ImageData>(
  {
    maxEntries: typeof window !== 'undefined' && window.innerWidth < 768 ? 40 : 90,
    maxConcurrent: typeof window !== 'undefined' && window.innerWidth < 768 ? 3 : 4,
    negativeTtlMs: 60_000,
  },
  async (url, signal) => {
    const response = await fetch(url, { signal, cache: 'force-cache' });
    if ([429, 502, 503].includes(response.status)) {
      const retryAfter = Math.min(Number(response.headers.get('retry-after')) || 30, 120);
      cache.blockFor(retryAfter * 1_000);
      throw new Error(`radar tile temporarily unavailable: ${response.status}`);
    }
    if (!response.ok) throw new Error(`radar tile unavailable: ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas unavailable');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
  },
);

export const isRadarTileBlocked = () => cache.isBlocked;
export const pruneRadarFrameCache = (paths: string[]) => cache.pruneFramePaths(paths);
export const frameTileUrl = (path: string, z: number, x: number, y: number, color = DEFAULT_COLOR_SCHEME) =>
  `/api/radar${path}/${SOURCE_TILE_SIZE}/${z}/${x}/${y}/${color}/1_1.png`;
export const loadRadarTile = (url: string, signal: AbortSignal) => cache.load(url, signal);
