'use client';
import L from 'leaflet';

/* ══════════════ CONFIG ══════════════ */
export const SRC = 512;                 // ขนาด tile ต้นทางจาก RainViewer (512 คมกว่า 256 เท่าตัว)
export const NATIVE_Z = 12;             // zoom สูงสุดที่ RainViewer มีข้อมูลจริง

export type RadarFrame = { time: number; path: string };
export type Quality = 'bicubic' | 'bilinear' | 'raw';

/* ══════════════ TILE CACHE (LRU) ══════════════ */
const CACHE_MAX = 480;
const cache = new Map<string, Promise<ImageData | null>>();

function touch(key: string, p: Promise<ImageData | null>) {
  cache.delete(key);
  cache.set(key, p);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

function loadTile(url: string): Promise<ImageData | null> {
  const hit = cache.get(url);
  if (hit) { touch(url, hit); return hit; }

  const p = new Promise<ImageData | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';           // ต้องมี ไม่งั้น getImageData จะถูก taint
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = SRC; c.height = SRC;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.clearRect(0, 0, SRC, SRC);
        ctx.drawImage(img, 0, 0, SRC, SRC);
        resolve(ctx.getImageData(0, 0, SRC, SRC));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

  touch(url, p);
  return p;
}

export function frameTileUrl(host: string, path: string, z: number, x: number, y: number, color = 4) {
  // smooth=1, snow=1 ให้ต้นทางเนียนมาแล้วชั้นหนึ่ง
  return `${host}${path}/${SRC}/${z}/${x}/${y}/${color}/1_1.png`;
}

/** preload ทุกเฟรมไว้ล่วงหน้า เพื่อให้เล่น timeline ลื่นไม่กระตุก */
export async function prefetchFrames(
  host: string, frames: RadarFrame[], z: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  concurrency = 6
) {
  const jobs: string[] = [];
  for (const f of frames)
    for (let x = bounds.minX; x <= bounds.maxX; x++)
      for (let y = bounds.minY; y <= bounds.maxY; y++)
        jobs.push(frameTileUrl(host, f.path, z, x, y));

  let i = 0;
  const worker = async () => { while (i < jobs.length) await loadTile(jobs[i++]); };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/* ══════════════ INTERPOLATION ══════════════ */
const catmull = (t: number, a: number, b: number, c: number, d: number) =>
  b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/* ══════════════ GRID LAYER ══════════════ */
export interface SmoothRadarOptions extends L.GridLayerOptions {
  host: string;
  framePath: string;
  colorScheme?: number;
  quality?: Quality;
  gain?: number;        // 1.0 = ปกติ, >1 ขับสีฝนอ่อนให้เห็นชัดขึ้น
  cutoff?: number;      // ตัดสัญญาณอ่อน 0-255 (กัน noise เขียวจาง ๆ เต็มจอ)
}

export const SmoothRadarLayer = (L.GridLayer as any).extend({
  options: {
    tileSize: 256,
    colorScheme: 4,
    quality: 'bicubic' as Quality,
    gain: 1,
    cutoff: 0,
    updateWhenZooming: false,
    updateWhenIdle: false,
    keepBuffer: 4,
  },

  createTile(coords: any, done: any) {
    const size = this.getTileSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const out = size.x * dpr;

    const canvas = L.DomUtil.create('canvas') as HTMLCanvasElement;
    canvas.width = out; canvas.height = out;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    this._draw(coords, canvas, out, dpr)
      .then(() => done(null, canvas))
      .catch((e: any) => done(e, canvas));

    return canvas;
  },

  async _draw(coords: any, canvas: HTMLCanvasElement, out: number, dpr: number) {
    const { host, framePath, colorScheme, quality, gain, cutoff } = this.options;
    const z = coords.z;
    const ctx = canvas.getContext('2d')!;

    /* ── กรณีอยู่ในช่วง zoom ที่มีข้อมูลจริง: วาดตรง ๆ คมสุด ── */
    if (z <= NATIVE_Z) {
      const img = await loadTile(frameTileUrl(host, framePath, z, coords.x, coords.y, colorScheme));
      if (!img) return;
      const tmp = document.createElement('canvas');
      tmp.width = SRC; tmp.height = SRC;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      ctx.drawImage(tmp, 0, 0, out, out);
      return;
    }

    /* ── zoom เกินข้อมูล: resample เอง ── */
    const scale = 1 << (z - NATIVE_Z);           // เช่น z=17 → 32 เท่า
    const n = 1 << NATIVE_Z;

    // พิกัดพิกเซล global ของ tile นี้ ในระบบ zoom 12
    const gx0 = (coords.x * SRC) / scale;
    const gy0 = (coords.y * SRC) / scale;
    const span = SRC / scale;                    // ความกว้างต้นทางที่ครอบคลุม (พิกเซล)

    // รวบรวม tile ต้นทางที่ต้องใช้ (เผื่อขอบ ±2 px สำหรับ bicubic)
    const pad = 2;
    const tx0 = Math.floor((gx0 - pad) / SRC), tx1 = Math.floor((gx0 + span + pad) / SRC);
    const ty0 = Math.floor((gy0 - pad) / SRC), ty1 = Math.floor((gy0 + span + pad) / SRC);

    const tiles = new Map<string, ImageData | null>();
    const jobs: Promise<void>[] = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const wx = ((tx % n) + n) % n;
        const wy = clamp(ty, 0, n - 1);
        const key = `${wx}/${wy}`;
        if (tiles.has(key)) continue;
        tiles.set(key, null);
        jobs.push(
          loadTile(frameTileUrl(host, framePath, NATIVE_Z, wx, wy, colorScheme))
            .then((d) => { tiles.set(key, d); })
        );
      }
    }
    await Promise.all(jobs);

    /** อ่านพิกเซลข้าม tile ได้ไร้รอยต่อ */
    const px = (gx: number, gy: number, ch: number): number => {
      let tx = Math.floor(gx / SRC), ty = Math.floor(gy / SRC);
      ty = clamp(ty, 0, n - 1);
      tx = ((tx % n) + n) % n;
      const d = tiles.get(`${tx}/${ty}`);
      if (!d) return 0;
      const ix = clamp(Math.floor(gx) - Math.floor(gx / SRC) * SRC, 0, SRC - 1);
      const iy = clamp(Math.floor(gy) - Math.floor(gy / SRC) * SRC, 0, SRC - 1);
      const o = (iy * SRC + ix) * 4;
      const a = d.data[o + 3];
      if (ch === 3) return a;
      return (d.data[o + ch] * a) / 255;          // premultiply กันขอบดำตอน interpolate
    };

    const outImg = ctx.createImageData(out, out);
    const O = outImg.data;
    const step = span / out;                      // ต้นทางกี่พิกเซลต่อ 1 พิกเซลผลลัพธ์

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
            const v =
              px(ix, iy, ch) * (1 - fx) * (1 - fy) +
              px(ix + 1, iy, ch) * fx * (1 - fy) +
              px(ix, iy + 1, ch) * (1 - fx) * fy +
              px(ix + 1, iy + 1, ch) * fx * fy;
            if (ch === 0) r = v; else if (ch === 1) g = v; else if (ch === 2) b = v; else a = v;
          }
        } else {
          // bicubic Catmull-Rom 4x4
          for (let ch = 0; ch < 4; ch++) {
            const col: number[] = [];
            for (let m = -1; m <= 2; m++) {
              col.push(
                catmull(fx, px(ix - 1, iy + m, ch), px(ix, iy + m, ch),
                             px(ix + 1, iy + m, ch), px(ix + 2, iy + m, ch))
              );
            }
            const v = catmull(fy, col[0], col[1], col[2], col[3]);
            if (ch === 0) r = v; else if (ch === 1) g = v; else if (ch === 2) b = v; else a = v;
          }
        }

        a = clamp(a * gain, 0, 255);
        if (a <= cutoff) { O[o + 3] = 0; continue; }

        // unpremultiply
        const inv = 255 / a;
        O[o]     = clamp(r * inv, 0, 255);
        O[o + 1] = clamp(g * inv, 0, 255);
        O[o + 2] = clamp(b * inv, 0, 255);
        O[o + 3] = a;
      }
    }

    ctx.putImageData(outImg, 0, 0);
  },
});

export const smoothRadarLayer = (opts: SmoothRadarOptions) => new (SmoothRadarLayer as any)(opts);
