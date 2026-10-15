export interface RadarGrid { d: Uint8Array; coverage: Uint8Array; w: number; h: number; ox: number; oy: number }

// An unloaded tile and an out-of-bounds pixel are unknown, not dry weather.
export function sampleCoveredArea(grid: RadarGrid, px: number, py: number, radius = 2): number | null {
  let total = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.round(px - grid.ox) + dx;
      const y = Math.round(py - grid.oy) + dy;
      if (x < 0 || y < 0 || x >= grid.w || y >= grid.h || !grid.coverage[y * grid.w + x]) return null;
      total += grid.d[y * grid.w + x]; count++;
    }
  }
  return count ? total / count : null;
}
