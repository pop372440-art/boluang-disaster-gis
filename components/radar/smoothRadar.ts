'use client';

import type { Coords, GridLayerOptions } from 'leaflet';
import {
  DEFAULT_COLOR_SCHEME,
  frameTileUrl,
  loadRadarTile,
  NATIVE_ZOOM,
  SOURCE_TILE_SIZE,
  type RadarQuality,
} from './radarClientCache';

const catmull = (t: number, a: number, b: number, c: number, d: number) =>
  b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const yieldToBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

// Keep CPU-heavy resampling jobs serial. Stale jobs exit immediately via their
// AbortSignal instead of competing with the current frame for the main thread.
let renderQueue: Promise<void> = Promise.resolve();

export type SmoothRadarOptions = GridLayerOptions & {
  framePath: string;
  colorScheme?: number;
  quality?: RadarQuality;
  gain?: number;
  cutoff?: number;
  requestSignal: AbortSignal;
};

let SmoothRadarLayer: any = null;

export function createSmoothRadarLayer(options: SmoothRadarOptions) {
  const L = require('leaflet') as typeof import('leaflet');
  if (!SmoothRadarLayer) {
    SmoothRadarLayer = L.GridLayer.extend({
      options: {
        tileSize: SOURCE_TILE_SIZE,
        colorScheme: DEFAULT_COLOR_SCHEME,
        quality: 'bilinear',
        gain: 1,
        cutoff: 6,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 1,
      },
      createTile(coords: Coords, done: (error: Error | null, tile: HTMLElement) => void) {
        const size = this.getTileSize().x;
        const canvas = L.DomUtil.create('canvas') as HTMLCanvasElement;
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        const render = renderQueue.then(() => this._render(coords, canvas, size));
        renderQueue = render.catch(() => undefined);
        render
          .then(() => done(null, canvas))
          .catch((error: Error) => done(error.name === 'AbortError' ? null : error, canvas));
        return canvas;
      },
      async _render(coords: Coords, canvas: HTMLCanvasElement, outputSize: number) {
        const { framePath, colorScheme, quality, gain, cutoff, requestSignal } = this.options;
        if (!framePath || requestSignal.aborted) return;
        const z = coords.z - 1;
        if (z < 0) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        if (z <= NATIVE_ZOOM) {
          const image = await loadRadarTile(frameTileUrl(framePath, z, coords.x, coords.y, colorScheme), requestSignal);
          if (!image || requestSignal.aborted) return;
          const temp = document.createElement('canvas');
          temp.width = SOURCE_TILE_SIZE;
          temp.height = SOURCE_TILE_SIZE;
          const tempContext = temp.getContext('2d');
          if (!tempContext) return;
          const buffer = new Uint8ClampedArray(image.data);
          for (let index = 3; index < buffer.length; index += 4) {
            const alpha = buffer[index] * gain;
            buffer[index] = alpha <= cutoff ? 0 : Math.min(alpha, 255);
          }
          tempContext.putImageData(new ImageData(buffer, image.width, image.height), 0, 0);
          context.imageSmoothingEnabled = quality !== 'raw';
          context.imageSmoothingQuality = quality === 'bicubic' ? 'high' : 'medium';
          context.drawImage(temp, 0, 0, outputSize, outputSize);
          return;
        }

        const scale = 1 << (z - NATIVE_ZOOM);
        const tileCount = 1 << NATIVE_ZOOM;
        const globalX = (coords.x * SOURCE_TILE_SIZE) / scale;
        const globalY = (coords.y * SOURCE_TILE_SIZE) / scale;
        const span = SOURCE_TILE_SIZE / scale;
        const padding = quality === 'bicubic' ? 2 : 1;
        const minX = Math.floor((globalX - padding) / SOURCE_TILE_SIZE);
        const maxX = Math.floor((globalX + span + padding) / SOURCE_TILE_SIZE);
        const minY = Math.floor((globalY - padding) / SOURCE_TILE_SIZE);
        const maxY = Math.floor((globalY + span + padding) / SOURCE_TILE_SIZE);
        const tiles = new Map<string, ImageData | null>();
        const jobs: Promise<void>[] = [];
        for (let x = minX; x <= maxX; x += 1) {
          for (let y = minY; y <= maxY; y += 1) {
            const wrappedX = ((x % tileCount) + tileCount) % tileCount;
            const wrappedY = clamp(y, 0, tileCount - 1);
            const key = `${wrappedX}/${wrappedY}`;
            if (tiles.has(key)) continue;
            tiles.set(key, null);
            jobs.push(loadRadarTile(
              frameTileUrl(framePath, NATIVE_ZOOM, wrappedX, wrappedY, colorScheme),
              requestSignal,
            ).then((tile) => { tiles.set(key, tile); }));
          }
        }
        await Promise.all(jobs);
        if (requestSignal.aborted) return;

        if (quality === 'raw') {
          const source = document.createElement('canvas');
          source.width = (maxX - minX + 1) * SOURCE_TILE_SIZE;
          source.height = (maxY - minY + 1) * SOURCE_TILE_SIZE;
          const sourceContext = source.getContext('2d');
          if (!sourceContext) return;
          for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
              if (requestSignal.aborted) return;
              const wrappedX = ((x % tileCount) + tileCount) % tileCount;
              const wrappedY = clamp(y, 0, tileCount - 1);
              const tile = tiles.get(`${wrappedX}/${wrappedY}`);
              if (tile) sourceContext.putImageData(
                tile,
                (x - minX) * SOURCE_TILE_SIZE,
                (y - minY) * SOURCE_TILE_SIZE,
              );
            }
          }
          context.imageSmoothingEnabled = false;
          context.drawImage(
            source,
            globalX - minX * SOURCE_TILE_SIZE,
            globalY - minY * SOURCE_TILE_SIZE,
            span,
            span,
            0,
            0,
            outputSize,
            outputSize,
          );
          return;
        }

        const pixel = (x: number, y: number, channel: number) => {
          const boundedY = clamp(y, 0, tileCount * SOURCE_TILE_SIZE - 1);
          const tileX = ((Math.floor(x / SOURCE_TILE_SIZE) % tileCount) + tileCount) % tileCount;
          const tileY = clamp(Math.floor(boundedY / SOURCE_TILE_SIZE), 0, tileCount - 1);
          const tile = tiles.get(`${tileX}/${tileY}`);
          if (!tile) return 0;
          const localX = ((Math.floor(x) % SOURCE_TILE_SIZE) + SOURCE_TILE_SIZE) % SOURCE_TILE_SIZE;
          const localY = Math.floor(boundedY) - tileY * SOURCE_TILE_SIZE;
          const offset = (localY * SOURCE_TILE_SIZE + localX) * 4;
          const alpha = tile.data[offset + 3];
          return channel === 3 ? alpha : (tile.data[offset + channel] * alpha) / 255;
        };

        const output = context.createImageData(outputSize, outputSize);
        const step = span / outputSize;
        for (let outputY = 0; outputY < outputSize; outputY += 1) {
          if (requestSignal.aborted) return;
          if (outputY > 0 && outputY % 8 === 0) await yieldToBrowser();
          const sourceY = globalY + (outputY + 0.5) * step - 0.5;
          const integerY = Math.floor(sourceY);
          const fractionY = sourceY - integerY;
          for (let outputX = 0; outputX < outputSize; outputX += 1) {
            const sourceX = globalX + (outputX + 0.5) * step - 0.5;
            const integerX = Math.floor(sourceX);
            const fractionX = sourceX - integerX;
            const offset = (outputY * outputSize + outputX) * 4;
            const channels = [0, 0, 0, 0];
            for (let channel = 0; channel < 4; channel += 1) {
              if (quality === 'bilinear') {
                channels[channel] = pixel(integerX, integerY, channel) * (1 - fractionX) * (1 - fractionY) +
                  pixel(integerX + 1, integerY, channel) * fractionX * (1 - fractionY) +
                  pixel(integerX, integerY + 1, channel) * (1 - fractionX) * fractionY +
                  pixel(integerX + 1, integerY + 1, channel) * fractionX * fractionY;
              } else {
                const columns = [-1, 0, 1, 2].map((row) => catmull(
                  fractionX,
                  pixel(integerX - 1, integerY + row, channel),
                  pixel(integerX, integerY + row, channel),
                  pixel(integerX + 1, integerY + row, channel),
                  pixel(integerX + 2, integerY + row, channel),
                ));
                channels[channel] = catmull(fractionY, columns[0], columns[1], columns[2], columns[3]);
              }
            }
            const rawAlpha = clamp(channels[3], 0, 255);
            const finalAlpha = clamp(rawAlpha * gain, 0, 255);
            if (finalAlpha <= cutoff || rawAlpha < 1) continue;
            const inverse = 255 / rawAlpha;
            output.data[offset] = clamp(channels[0] * inverse, 0, 255);
            output.data[offset + 1] = clamp(channels[1] * inverse, 0, 255);
            output.data[offset + 2] = clamp(channels[2] * inverse, 0, 255);
            output.data[offset + 3] = finalAlpha;
          }
        }
        context.putImageData(output, 0, 0);
      },
    });
  }
  return new SmoothRadarLayer(options);
}
