export type RadarQuality = 'bicubic' | 'bilinear' | 'raw';

export type RadarDeviceCapabilities = {
  width: number;
  memoryGb: number;
  logicalCores: number;
  reducedMotion: boolean;
};

export const MIN_ANIMATION_FRAME_MS = 900;

export function selectAutomaticRadarQuality(capabilities: RadarDeviceCapabilities): RadarQuality {
  if (
    capabilities.reducedMotion ||
    capabilities.width < 768 ||
    capabilities.memoryGb <= 4 ||
    capabilities.logicalCores <= 4
  ) {
    return 'raw';
  }

  // Bicubic is intentionally opt-in. Running it automatically for every
  // visible Leaflet tile can monopolise the browser main thread.
  return 'bilinear';
}

export const selectEffectiveRadarQuality = (
  preferred: RadarQuality,
  isAnimating: boolean,
): RadarQuality => (isAnimating ? 'raw' : preferred);

export const clampAnimationFrameMs = (requestedMs: number) =>
  Math.max(MIN_ANIMATION_FRAME_MS, Number.isFinite(requestedMs) ? requestedMs : MIN_ANIMATION_FRAME_MS);
