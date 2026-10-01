import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_DASHBOARD_SELECT,
  countBy,
  filterIncidents,
  isResolvedStatus,
  toPublicIncident,
  type PublicIncident,
} from '../lib/dashboard/public-dashboard.ts';

const incidents: PublicIncident[] = [
  { riskType: 'ไฟป่า', severityLevel: 3, villageName: 'บ้านแม่หืด', status: 'รับเรื่องแล้ว', createdAt: '2026-09-27T18:00:00.000Z' },
  { riskType: 'น้ำท่วม', severityLevel: 2, villageName: 'บ้านบ่อหลวง', status: 'ดำเนินการเสร็จแล้ว', createdAt: '2026-09-28T03:00:00.000Z' },
  { riskType: 'ไฟป่า', severityLevel: 1, villageName: 'บ้านบ่อหลวง', status: 'กำลังดำเนินการ', createdAt: '2026-09-28T08:00:00.000Z' },
];

test('dashboard projection excludes private and precise-location fields', () => {
  assert.doesNotMatch(PUBLIC_DASHBOARD_SELECT, /reporter|tracking|description|latitude|longitude|image|action/);
  assert.match(PUBLIC_DASHBOARD_SELECT, /risk_type/);
  assert.match(PUBLIC_DASHBOARD_SELECT, /village_name/);
});

test('invalid database dates are excluded and missing labels are normalized', () => {
  assert.equal(toPublicIncident({ risk_type: 'ไฟป่า', severity_level: 2, village_name: 'บ้านแม่หืด', status: 'รับเรื่องแล้ว', created_at: 'invalid' }), null);
  const normalized = toPublicIncident({ risk_type: '', severity_level: null, village_name: null, status: '', created_at: '2026-09-28T00:00:00.000Z' });
  assert.equal(normalized?.riskType, 'ไม่ระบุประเภท');
  assert.equal(normalized?.villageName, 'ไม่ระบุหมู่บ้าน');
  assert.equal(normalized?.severityLevel, null);
});

test('dashboard filters date using Thailand day boundaries and combines all fields', () => {
  const filtered = filterIncidents(incidents, {
    dateFrom: '2026-09-28',
    dateTo: '2026-09-28',
    village: 'บ้านบ่อหลวง',
    riskType: 'ไฟป่า',
    status: 'กำลังดำเนินการ',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].severityLevel, 1);
});

test('status and grouping helpers produce dashboard totals', () => {
  assert.equal(isResolvedStatus('ปิดจ๊อบ'), true);
  assert.equal(isResolvedStatus('กำลังดำเนินการ'), false);
  assert.deepEqual(countBy(incidents, 'riskType'), [
    { name: 'ไฟป่า', value: 2 },
    { name: 'น้ำท่วม', value: 1 },
  ]);
});
