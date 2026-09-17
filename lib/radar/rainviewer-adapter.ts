import type { RadarFrame, RadarMetadata } from './types.ts';

type RawFrame = { time?: unknown; path?: unknown };

const parseFrame = (value: RawFrame, kind: RadarFrame['kind']): RadarFrame | null => {
  const time = Number(value?.time);
  const path = typeof value?.path === 'string' ? value.path : '';
  if (!Number.isFinite(time) || time <= 0 || !/^\/v\d+\/radar\/[A-Za-z0-9_-]+$/.test(path)) return null;
  return { time, path, kind };
};

const parseFrameList = (value: unknown, kind: RadarFrame['kind']) => {
  if (!Array.isArray(value)) return [];
  return value.map((frame) => parseFrame(frame as RawFrame, kind)).filter((frame): frame is RadarFrame => frame != null);
};

export function parseRainViewerMetadata(value: unknown, fetchedAt = new Date()): RadarMetadata {
  if (!value || typeof value !== 'object') throw new Error('RainViewer metadata ไม่ถูกต้อง');
  const raw = value as Record<string, any>;
  const observedFrames = parseFrameList(raw.radar?.past ?? raw.observedFrames, 'observed');
  const nowcastFrames = parseFrameList(raw.radar?.nowcast ?? raw.nowcastFrames, 'nowcast');
  if (!observedFrames.length) throw new Error('RainViewer ไม่มี observed radar frame ที่ใช้ได้');

  const generatedSeconds = Number(raw.generated);
  const generatedAtFromApi = typeof raw.generatedAt === 'string' && Number.isFinite(Date.parse(raw.generatedAt))
    ? new Date(raw.generatedAt).toISOString()
    : null;
  const generatedAt = generatedAtFromApi ?? (Number.isFinite(generatedSeconds)
    ? new Date(generatedSeconds * 1000).toISOString()
    : new Date(observedFrames[observedFrames.length - 1].time * 1000).toISOString());

  const fetchedAtFromApi = typeof raw.fetchedAt === 'string' && Number.isFinite(Date.parse(raw.fetchedAt))
    ? new Date(raw.fetchedAt).toISOString()
    : fetchedAt.toISOString();

  return {
    source: 'RainViewer',
    generatedAt,
    fetchedAt: fetchedAtFromApi,
    observedFrames,
    nowcastFrames,
    frames: [...observedFrames, ...nowcastFrames],
    pastCount: observedFrames.length,
  };
}
