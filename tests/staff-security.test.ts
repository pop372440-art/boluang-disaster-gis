import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeVerifiedJwtClaims,
  isStaffRole,
  roleAtLeast,
  STAFF_ROLES,
} from '../lib/staff/security.ts';

function unsignedToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('Staff Portal recognizes only the four supported roles', () => {
  assert.deepEqual(STAFF_ROLES, ['viewer', 'operator', 'approver', 'admin']);
  for (const role of STAFF_ROLES) assert.equal(isStaffRole(role), true);
  assert.equal(isStaffRole('owner'), false);
  assert.equal(isStaffRole(null), false);
});

test('role hierarchy prevents lower roles from mutating privileged workflows', () => {
  assert.equal(roleAtLeast('viewer', 'operator'), false);
  assert.equal(roleAtLeast('operator', 'operator'), true);
  assert.equal(roleAtLeast('operator', 'approver'), false);
  assert.equal(roleAtLeast('approver', 'operator'), true);
  assert.equal(roleAtLeast('admin', 'approver'), true);
});

test('verified access-token payload exposes AAL and session fingerprint source', () => {
  assert.deepEqual(decodeVerifiedJwtClaims(unsignedToken({ aal: 'aal2', session_id: 'session-1', exp: 123 })), {
    aal: 'aal2',
    session_id: 'session-1',
    exp: 123,
  });
  assert.deepEqual(decodeVerifiedJwtClaims('not-a-jwt'), {});
});
