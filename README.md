# Bo Luang Disaster GIS

ระบบสนับสนุนการตัดสินใจด้านสาธารณภัยของเทศบาลตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่ หน้า `/radar` แสดงเรดาร์ตรวจวัดฝนและประมาณการฝนรายหมู่บ้าน โดยระบบ **ไม่ใช่คำสั่งอพยพอัตโนมัติ** การแจ้งเตือนจริงต้องได้รับการตรวจสอบและอนุมัติจากเจ้าหน้าที่ผู้รับผิดชอบ

## Data sources

| ข้อมูล | แหล่งข้อมูล | การใช้งาน | Freshness เริ่มต้น |
|---|---|---|---|
| Radar observation/nowcast | RainViewer | ภาพเรดาร์และ animation; แยก `past` กับ `nowcast` ตาม metadata จริง | stale 20 นาที, expired 40 นาที |
| Hourly/daily precipitation | Open-Meteo | sampling 3–5 จุดต่อหมู่บ้าน, ฝน T+1 ถึง T+3 และฝนย้อนหลัง 7 วัน | stale 15 นาที, expired 30 นาที |
| Independent forecast cross-check | MET Norway Locationforecast 2.0 | จุดตัวแทน 1 จุดต่อหมู่บ้าน ใช้เปรียบเทียบฝน 3 ชั่วโมงกับ Open-Meteo เท่านั้น | stale 90 นาที, expired 180 นาที |
| ขอบเขตตำบล/หมู่บ้าน | GeoJSON ของโครงการ | ขอบเขตตำบลและ 13 หมู่บ้าน | ตรวจ schema ทุกครั้งก่อนใช้ |
| Usage statistics | Supabase RPC | สถิติการใช้งาน | ตามเวลาตอบกลับของฐานข้อมูล |

RainViewer metadata เรียกผ่าน `/api/radar/frames` และ radar tiles เรียกผ่าน `/api/radar/[...path]` เท่านั้น ส่วน Open-Meteo เรียกผ่าน `/api/forecast` ซึ่ง cache 10 นาที และ MET Norway เรียกผ่าน server route `/api/forecast/met-norway` ซึ่ง cache 15 นาที ระบบไม่เรียก MET Norway จาก browser โดยตรง และส่ง `User-Agent` ที่ระบุตัวโครงการตามข้อกำหนดของผู้ให้บริการ

## Risk formula

```text
rain3h = precipitation(T+1) + precipitation(T+2) + precipitation(T+3)
api7 = ผลรวม precipitation_sum ของ 7 วันที่ผ่านมา
soilFactor = 1 + min(api7 / 120, 0.5)
terrainFactor = 1.25 เมื่อ slope > 20°
                1.10 เมื่อ slope > 12°
                1.00 กรณีอื่น
riskIndex = rain3h × soilFactor × terrainFactor
```

ระบบสรุปฝน 3 ชั่วโมงรายหมู่บ้านเป็น mean, max และ p90 โดยใช้ p90 ประเมินความเสี่ยงตามค่า config เริ่มต้น เกณฑ์อยู่ใน `lib/radar/threshold-config.ts`: NORMAL `<10`, WATCH `≥10`, WARNING `≥35`, DANGER `≥60`, CRITICAL `≥90` ทุกค่ายังต้องสอบเทียบกับเหตุการณ์จริงในพื้นที่บ่อหลวง

หากข้อมูลฝนขาดหาย, เป็น NaN, ติดลบ หรือหมดอายุ ระบบจะไม่แทนค่าด้วยศูนย์เพื่อออกผล “ปกติ” หากไม่มี slope ระบบใช้ตัวคูณอ้างอิง 1.00 แต่ระบุ confidence ต่ำอย่างชัดเจน

## Assumptions and limitations

- GeoJSON ปัจจุบันไม่มี slope จึงแสดง confidence ต่ำ
- เกณฑ์ความเสี่ยงยังไม่มีผล validation ย้อนหลัง จึงห้ามกล่าวอ้างว่าระบบ “ทำนายแม่นยำ”
- Radar observation และ Open-Meteo forecast เป็นคนละชุดข้อมูลและห้ามตีความแทนกัน
- MET Norway เป็นข้อมูลตรวจสอบไขว้ ไม่ถูกนำไปคำนวณ riskIndex หรือออก alert โดยตรงจนกว่าจะผ่าน local validation; Open-Meteo p90 มาจาก 3–5 จุด แต่ MET Norway เป็นจุดตัวแทนเพียงจุดเดียว จึงไม่ใช่การเปรียบเทียบ spatial support แบบเดียวกัน
- ระดับความสอดคล้องของแบบจำลองใช้ค่าความต่างเริ่มต้น `≤2`, `≤5`, และ `>5` มม. ซึ่งอยู่ใน config และยังต้องสอบเทียบกับมาตรวัดฝน/เหตุการณ์จริง
- ข้อมูล MET Norway ต้องให้เครดิตตามใบอนุญาตของผู้ให้บริการ ระบบไม่ใช้ชื่อ โลโก้ หรือรูปแบบหน้าตาของ Yr เพื่อทำให้เข้าใจว่าเป็นบริการอย่างเป็นทางการของ Yr, NRK หรือ MET Norway
- ถ้า RainViewer `nowcast` ว่าง ระบบจะไม่ติดป้าย observed frame ว่า nowcast
- Supabase client ใช้เฉพาะ anon key; ห้ามใส่ service-role key ใน client bundle และต้องตรวจ RLS ใน dashboard/database แยกต่างหาก
- Alert ต้องผ่านเกณฑ์ 2 รอบก่อนยกระดับ ใช้ hysteresis ตอนลดระดับ และ notification จริงอยู่ในสถานะรอเจ้าหน้าที่อนุมัติ
- ไม่มี dataset พื้นที่น้ำท่วมซ้ำซากใน repository จึงแสดง layer เป็น unavailable โดยไม่สร้างข้อมูลจำลอง
- `boluang_landslide_risk.json` เป็น polygon hazard zones ไม่ใช่จุดสำรวจภาคสนาม

## Development

กำหนด `MET_NORWAY_USER_AGENT` ใน Vercel ได้เพื่อระบุชื่อแอปและช่องทางติดต่อของผู้ดูแลให้ชัดเจนขึ้น หากไม่กำหนด ระบบจะใช้ชื่อโครงการและ URL ของ repository โดยอัตโนมัติ

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

รายละเอียด audit, architecture และแผน Phase 1–4 อยู่ที่ [docs/radar-architecture.md](docs/radar-architecture.md)
