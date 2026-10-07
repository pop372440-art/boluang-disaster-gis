import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLineGroupRegistration, registrationSuccessText } from '../lib/environment/line-registration.ts';

test('parses staff and public LINE group registration commands exactly', () => {
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม เจ้าหน้าที่ secret'), { audience: 'staff', routingScope: 'all', token: 'secret' });
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม สิงห์ไฟ secret'), { audience: 'public', routingScope: 'wildfire', token: 'secret' });
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม เครือข่าย secret'), { audience: 'public', routingScope: 'general', token: 'secret' });
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม สาธารณะ secret'), { audience: 'public', routingScope: 'general', token: 'secret' });
  assert.equal(parseLineGroupRegistration('ลงทะเบียน สาธารณะ secret'), null);
});

test('registration acknowledgement matches the selected audience', () => {
  assert.equal(registrationSuccessText('public', 'wildfire'), 'ลงทะเบียนกลุ่มสิงห์ไฟสำเร็จ');
  assert.equal(registrationSuccessText('public', 'general'), 'ลงทะเบียนกลุ่มเครือข่ายแจ้งเตือนสำเร็จ');
  assert.equal(registrationSuccessText('staff', 'all'), 'ลงทะเบียนกลุ่มเจ้าหน้าที่สำเร็จ');
});
