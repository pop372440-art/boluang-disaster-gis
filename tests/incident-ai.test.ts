import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getIncidentAiPublicError,
  INCIDENT_RISK_TYPES,
  parseIncidentAiResult,
  shouldUseIncidentAiFallback
} from '../lib/incident-ai.ts';

test('incident AI accepts only a complete result that matches the report form', () => {
  assert.deepEqual(
    parseIncidentAiResult({
      type: 'ต้นไม้ล้มขวางทาง',
      severity: 3,
      description: 'พบกิ่งไม้ขนาดใหญ่กีดขวางและมีเจ้าหน้าที่กำลังตัดออก'
    }),
    {
      type: 'ต้นไม้ล้มขวางทาง',
      severity: 3,
      description: 'พบกิ่งไม้ขนาดใหญ่กีดขวางและมีเจ้าหน้าที่กำลังตัดออก'
    }
  );

  assert.equal(parseIncidentAiResult({ type: 'แผ่นดินไหว', severity: 3, description: 'ประเภทไม่อยู่ในแบบฟอร์ม' }), null);
  assert.equal(parseIncidentAiResult({ type: INCIDENT_RISK_TYPES[0], severity: 7, description: 'ระดับเกินช่วง' }), null);
  assert.equal(parseIncidentAiResult({ type: INCIDENT_RISK_TYPES[0], severity: 2, description: '' }), null);
});

test('incident AI falls back only for provider or configuration failures', () => {
  for (const code of ['RATE_LIMITED', 'PROVIDER_AUTH_ERROR', 'PROVIDER_UNAVAILABLE', 'CONFIGURATION_ERROR', 'TIMEOUT']) {
    assert.equal(shouldUseIncidentAiFallback(code), true, code);
  }

  for (const code of ['INVALID_IMAGE', 'UNSUPPORTED_IMAGE', 'MODEL_REQUEST_REJECTED', 'NO_RESULT', 'INVALID_RESULT']) {
    assert.equal(shouldUseIncidentAiFallback(code), false, code);
  }
});

test('incident AI exposes actionable public errors without provider details', () => {
  assert.deepEqual(getIncidentAiPublicError(429), {
    code: 'RATE_LIMITED',
    message: 'AI มีผู้ใช้งานจำนวนมาก กรุณารอสักครู่แล้วลองวิเคราะห์อีกครั้ง'
  });
  assert.equal(getIncidentAiPublicError(403).code, 'PROVIDER_AUTH_ERROR');
  assert.equal(getIncidentAiPublicError(503).code, 'PROVIDER_UNAVAILABLE');
  assert.equal(getIncidentAiPublicError(400).code, 'MODEL_REQUEST_REJECTED');
});
