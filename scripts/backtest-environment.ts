import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { backtestEnvironmentalRows, type HistoricalEnvironmentalRow } from '../lib/environment/backtest.ts';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run backtest:environment -- path/to/verified-history.json');
const rows = JSON.parse(await readFile(resolve(input), 'utf8')) as HistoricalEnvironmentalRow[];
if (!Array.isArray(rows)) throw new Error('ไฟล์ย้อนหลังต้องเป็น JSON array');
const result = backtestEnvironmentalRows(rows, '2026-01-01T00:00:00+07:00', '2026-05-31T23:59:59+07:00');
if (result.count === 0) throw new Error('ไม่พบข้อมูลจริงในช่วง 1 ม.ค.–31 พ.ค. 2569; ห้ามสรุปว่า backtest ผ่าน');
process.stdout.write(`${JSON.stringify({ period: '2026-01-01/2026-05-31 Asia/Bangkok', ...result }, null, 2)}\n`);
