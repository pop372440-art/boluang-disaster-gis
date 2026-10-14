import test from 'node:test';
import assert from 'node:assert/strict';
import { hotspotAge, validPm, windFrom } from '../lib/environment/fire-smoke.ts';
const now=Date.parse('2026-10-14T03:00:00Z');
test('hotspot age does not treat missing or future observations as recent',()=>{
 assert.equal(hotspotAge({acquiredAt:null},now),'unknown');
 assert.equal(hotspotAge({acquiredAt:'2026-10-15T03:00:00Z'},now),'unknown');
 assert.equal(hotspotAge({acquiredAt:'2026-10-14T02:00:00Z'},now),'recent');
 assert.equal(hotspotAge({acquiredAt:'2026-10-13T13:00:00Z'},now),'older');
 assert.equal(hotspotAge({acquiredAt:'2026-10-12T03:00:00Z'},now),'historical');
});
test('missing PM is not clean air; wind correctly describes source direction',()=>{
 assert.equal(validPm(null),null);assert.equal(validPm(-1),null);assert.equal(validPm(NaN),null);assert.equal(validPm(0),0);
 assert.equal(windFrom(360),'เหนือ');assert.equal(windFrom(90),'ตะวันออก');assert.equal(windFrom(null),'ไม่ทราบทิศ');
});
