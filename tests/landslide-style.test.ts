import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLandslideFeature, landslideFeatureStyle } from '../lib/radar/landslide-style.ts';

test('landslide source class 1 is high and class 2 is moderate', () => {
  assert.equal(classifyLandslideFeature({ class: 1, ls_desth: 'สูง' }), 'high');
  assert.equal(classifyLandslideFeature({ class: 2, ls_desth: 'ปานกลาง' }), 'moderate');
  assert.equal(landslideFeatureStyle({ class: 1 }).fillColor, '#EF4444');
  assert.equal(landslideFeatureStyle({ class: 2 }).fillColor, '#F59E0B');
});
