import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_DATA_INCIDENT_SELECT,
  buildIncidentCsv,
  csvCell,
  toPublicIncidentRecord,
} from '../lib/open-data/incidents.ts';

test('open data projection excludes identifiers, free text and precise location', () => {
  assert.doesNotMatch(OPEN_DATA_INCIDENT_SELECT, /id|tracking|reporter|description|latitude|longitude|image|action/);
  assert.match(OPEN_DATA_INCIDENT_SELECT, /risk_type/);
  assert.match(OPEN_DATA_INCIDENT_SELECT, /village_name/);
});

test('public incident uses Bangkok date precision and normalized fields', () => {
  const record = toPublicIncidentRecord({
    created_at: '2026-09-27T18:30:00.000Z',
    risk_type: 'ไฟป่า',
    severity_level: '3',
    village_name: 'บ้านแม่หืด',
    status: 'รับเรื่องแล้ว',
  });
  assert.deepEqual(record, {
    reportDate: '2026-09-28',
    riskType: 'ไฟป่า',
    severityLevel: 3,
    villageName: 'บ้านแม่หืด',
    status: 'รับเรื่องแล้ว',
  });
});

test('CSV export is UTF-8, quotes values and blocks spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("https://example.test")'), '"\'=HYPERLINK(""https://example.test"")"');
  const csv = buildIncidentCsv([{
    reportDate: '2026-09-28',
    riskType: '+สูตร',
    severityLevel: null,
    villageName: 'บ้านบ่อหลวง',
    status: 'รับเรื่องแล้ว',
  }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /"'\+สูตร"/);
  assert.doesNotMatch(csv, /latitude|longitude|description|tracking/i);
});

test('invalid incident timestamps are not published', () => {
  assert.equal(toPublicIncidentRecord({
    created_at: 'invalid',
    risk_type: 'ไฟป่า',
    severity_level: 2,
    village_name: 'บ้านแม่หืด',
    status: 'รับเรื่องแล้ว',
  }), null);
});
