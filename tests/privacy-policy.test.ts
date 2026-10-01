import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../app/privacy/page.tsx', import.meta.url), 'utf8');
const report = readFileSync(new URL('../app/report/page.tsx', import.meta.url), 'utf8');

test('privacy policy covers the audited PDPA topics', () => {
  for (const expected of [
    'ผู้ควบคุมข้อมูลและช่องทางติดต่อ', 'ข้อมูลส่วนบุคคลที่เก็บรวบรวม', 'วัตถุประสงค์และฐานกฎหมาย',
    'การใช้ AI และการตัดสินใจ', 'ผู้รับข้อมูลและผู้ให้บริการ', 'การส่งข้อมูลไปต่างประเทศ',
    'ระยะเวลาเก็บรักษา', 'สิทธิของเจ้าของข้อมูล', 'การรักษาความมั่นคงปลอดภัย',
    'Cookie, Analytics และบันทึกทางเทคนิค', 'การถอนความยินยอมและร้องเรียน', 'วันที่มีผลและประวัติการแก้ไข',
  ]) assert.match(policy, new RegExp(expected));
});

test('privacy policy identifies actual processors and avoids claiming QuickChart is active', () => {
  assert.match(policy, /Supabase/);
  assert.match(policy, /Vercel/);
  assert.match(policy, /Google Gemini/);
  assert.match(policy, /Groq/);
  assert.match(policy, /ไม่พบการส่งข้อมูลไป QuickChart/);
});

test('incident report consent links to the full privacy policy', () => {
  assert.match(report, /href="\/privacy"/);
  assert.match(report, /อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม/);
  assert.match(report, /รับทราบประกาศความเป็นส่วนตัว/);
  assert.match(report, /การยืนยันการรับทราบ ไม่ใช่การยินยอมแบบเหมารวม/);
});

test('AI image analysis is optional and starts only from an explicit button', () => {
  assert.doesNotMatch(report, /setSelectedFile\(compressedFile\);\s*await analyzeImageFile\(compressedFile\)/);
  assert.match(report, /วิเคราะห์ภาพด้วย AI \(ไม่บังคับ\)/);
  assert.match(report, /onClick=\{\(\) => analyzeImageFile\(selectedFile\)\}/);
});
