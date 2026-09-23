import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampAnimationFrameMs,
  selectAutomaticRadarQuality,
  selectEffectiveRadarQuality,
} from '../lib/radar/radar-render-policy.ts';

test('automatic quality never enables expensive bicubic rendering', () => {
  assert.equal(selectAutomaticRadarQuality({ width: 1440, memoryGb: 16, logicalCores: 8, reducedMotion: false }), 'bilinear');
  assert.equal(selectAutomaticRadarQuality({ width: 390, memoryGb: 8, logicalCores: 8, reducedMotion: false }), 'raw');
  assert.equal(selectAutomaticRadarQuality({ width: 1440, memoryGb: 16, logicalCores: 8, reducedMotion: true }), 'raw');
});

test('animation always uses the non-blocking raw path', () => {
  assert.equal(selectEffectiveRadarQuality('bicubic', true), 'raw');
  assert.equal(selectEffectiveRadarQuality('bilinear', true), 'raw');
  assert.equal(selectEffectiveRadarQuality('bicubic', false), 'bicubic');
});

test('animation interval has a safe lower bound', () => {
  assert.equal(clampAnimationFrameMs(350), 900);
  assert.equal(clampAnimationFrameMs(1_600), 1_600);
  assert.equal(clampAnimationFrameMs(Number.NaN), 900);
});
