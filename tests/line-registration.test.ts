import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLineGroupRegistration, registrationSuccessText } from '../lib/environment/line-registration.ts';

test('parses staff and public LINE group registration commands exactly', () => {
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม สาธารณะ secret'), { audience: 'public', token: 'secret' });
  assert.deepEqual(parseLineGroupRegistration('ลงทะเบียนกลุ่ม เจ้าหน้าที่ secret'), { audience: 'staff', token: 'secret' });
  assert.equal(parseLineGroupRegistration('ลงทะเบียน สาธารณะ secret'), null);
});

test('registration acknowledgement matches the selected audience', () => {
  assert.equal(registrationSuccessText('public'), 'ลงทะเบียนกลุ่มสาธารณะสำเร็จ');
  assert.equal(registrationSuccessText('staff'), 'ลงทะเบียนกลุ่มเจ้าหน้าที่สำเร็จ');
});
