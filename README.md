# Bo Luang Disaster GIS

ระบบสนับสนุนการตัดสินใจด้านสาธารณภัยของเทศบาลตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่ หน้า `/radar` แสดงเรดาร์ตรวจวัดฝนและประมาณการฝนรายหมู่บ้าน โดยระบบ **ไม่ใช่คำสั่งอพยพอัตโนมัติ** การแจ้งเตือนจริงต้องได้รับการตรวจสอบและอนุมัติจากเจ้าหน้าที่ผู้รับผิดชอบ

## Data sources

| ข้อมูล | แหล่งข้อมูล | การใช้งาน | Freshness เริ่มต้น |
|---|---|---|---|
| Radar observation/nowcast | RainViewer | ภาพเรดาร์และ animation; แยก `past` กับ `nowcast` ตาม metadata จริง | stale 20 นาที, expired 40 นาที |
| Hourly/daily precipitation | Open-Meteo | sampling 3–5 จุดต่อหมู่บ้าน, ฝน T+1 ถึง T+3 และฝนย้อนหลัง 7 วัน | stale 15 นาที, expired 30 นาที |
| Independent forecast cross-check | MET Norway Locationforecast 2.0 | จุดตัวแทน 1 จุดต่อหมู่บ้าน ใช้เปรียบเทียบฝน 3 ชั่วโมงกับ Open-Meteo เท่านั้น | stale 90 นาที, expired 180 นาที |
| Planning outlook D+7–D+9 | Open-Meteo daily + MET Norway | เปรียบเทียบฝนรายวัน, model spread, probability, อุณหภูมิและลม เพื่อวางแผนเท่านั้น | stale 120 นาที, expired 360 นาที |
| Executive planning outlook | Google WeatherNext 3 ผ่าน BigQuery; WeatherNext 2 ผ่าน Open-Meteo เป็น fallback | มัธยฐาน ensemble (p50) รายชั่วโมงรวมเป็นฝนรายวันสำหรับแผน 15 วันเท่านั้น | แสดงรอบแบบจำลองและเวลาเรียกข้อมูลทุกครั้ง |
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
- แนวโน้ม D+7–D+9 แสดงเป็น `low`, `monitor`, `prepare` หรือ `unavailable` และไม่เชื่อมเข้ากับ Alert state machine; คำว่า `prepare` หมายถึงเตรียมตรวจสอบข้อมูล/แผน ไม่ใช่คำสั่งปฏิบัติการหรืออพยพ
- `consensusRainMm` เป็นค่าเฉลี่ยของแหล่งข้อมูลที่ใช้งานได้ และ `upperScenarioRainMm` เป็นค่าสูงสุดระหว่างแหล่งข้อมูล ไม่ใช่ ensemble p90 ทางอุตุนิยมวิทยา
- ระดับความสอดคล้องของแบบจำลองใช้ค่าความต่างเริ่มต้น `≤2`, `≤5`, และ `>5` มม. ซึ่งอยู่ใน config และยังต้องสอบเทียบกับมาตรวัดฝน/เหตุการณ์จริง
- ข้อมูล MET Norway ต้องให้เครดิตตามใบอนุญาตของผู้ให้บริการ ระบบไม่ใช้ชื่อ โลโก้ หรือรูปแบบหน้าตาของ Yr เพื่อทำให้เข้าใจว่าเป็นบริการอย่างเป็นทางการของ Yr, NRK หรือ MET Norway
- ถ้า RainViewer `nowcast` ว่าง ระบบจะไม่ติดป้าย observed frame ว่า nowcast
- Supabase client ฝั่ง browser ใช้เฉพาะ anon/publishable key; ห้ามใส่ secret หรือ service-role key ใน client bundle และต้องตรวจ RLS ใน dashboard/database แยกต่างหาก
- Alert ต้องผ่านเกณฑ์ 2 รอบก่อนยกระดับ ใช้ hysteresis ตอนลดระดับ และ notification จริงอยู่ในสถานะรอเจ้าหน้าที่อนุมัติ
- ไม่มี dataset พื้นที่น้ำท่วมซ้ำซากใน repository จึงแสดง layer เป็น unavailable โดยไม่สร้างข้อมูลจำลอง
- `boluang_landslide_risk.json` เป็น polygon hazard zones ไม่ใช่จุดสำรวจภาคสนาม

## Development

กำหนด `MET_NORWAY_USER_AGENT` ใน Vercel ได้เพื่อระบุชื่อแอปและช่องทางติดต่อของผู้ดูแลให้ชัดเจนขึ้น หากไม่กำหนด ระบบจะใช้ชื่อโครงการและ URL ของ repository โดยอัตโนมัติ

ระบบวิเคราะห์ภาพในแบบฟอร์มแจ้งเหตุใช้ Gemini เป็นผู้ให้บริการหลัก และรองรับ Groq Vision เป็นระบบสำรองเมื่อ Gemini ถูกจำกัดอัตราการใช้งาน หมดเวลา หรือขัดข้อง กำหนด `GROQ_API_KEY` เป็น server-only environment variable ใน Vercel สำหรับ Preview และ Production โดยไม่ใช้คำนำหน้า `NEXT_PUBLIC_` สามารถกำหนด `GROQ_VISION_MODEL` เพิ่มเติมได้; ค่าเริ่มต้นคือ `qwen/qwen3.8-27b` หากไม่กำหนดคีย์ ระบบยังทำงานด้วย Gemini ตามเดิม

หน้า `/status` อ่านข้อมูลผ่าน `POST /api/report-status` เท่านั้น API ต้องมี `SUPABASE_SECRET_KEY` (แนะนำ) หรือ `SUPABASE_SERVICE_ROLE_KEY` เป็น server-only environment variable ใน Preview และ Production และควรกำหนด `REPORT_STATUS_AUDIT_PEPPER` แยกต่อ environment สำหรับทำ fingerprint ใน audit log โดยไม่บันทึก IP หรือโทเคนจริง รหัส `BL-123456` แบบเดิมไม่เปิดใช้โดยค่าเริ่มต้น; ตัวแปร `REPORT_STATUS_ALLOW_LEGACY_CODES=true` มีไว้สำหรับช่วงย้ายระบบชั่วคราวเท่านั้นและไม่แนะนำสำหรับ Production

หน้า `/center/executive` รองรับ Google WeatherNext 3 จาก BigQuery Analytics Hub หลังบัญชี Google Cloud ได้รับ allowlist และ subscribe ชุดข้อมูลแล้ว ให้สร้าง service account ที่มีสิทธิ์อ่าน linked dataset และรัน BigQuery job จากนั้นกำหนดตัวแปร server-only ต่อไปนี้ใน Vercel Preview และ Production (ห้ามใช้คำนำหน้า `NEXT_PUBLIC_`):

- `GOOGLE_WEATHERNEXT3_PROJECT_ID` — Google Cloud project ที่ใช้รัน query และมี linked dataset
- `GOOGLE_WEATHERNEXT3_DATASET_ID` — ชื่อ linked dataset ที่มีตาราง `weathernext_3_0_0_0p1deg`
- `GOOGLE_WEATHERNEXT3_SERVICE_ACCOUNT_EMAIL` — อีเมล service account
- `GOOGLE_WEATHERNEXT3_PRIVATE_KEY` — private key แบบ PEM; ใส่เป็น secret และรองรับทั้ง newline จริงหรือ `\n`

หากตัวแปรไม่ครบ การอนุญาตยังไม่สำเร็จ หรือ BigQuery ขัดข้อง ระบบจะติดป้ายชัดเจนและใช้ WeatherNext 2 ผ่าน Open-Meteo เป็นข้อมูลสำรอง โดยไม่แอบเปลี่ยนชื่อเป็น WeatherNext 3 ข้อมูล WeatherNext 3 ใช้ `total_precipitation_1hr_p50` หน่วยเมตร แปลงเป็นมิลลิเมตรและรวมตามวันปฏิทินเวลาไทย ไม่ใช้เป็นประกาศเตือนหรือคำสั่งปฏิบัติการอัตโนมัติ

เอกสารอ้างอิงผู้ให้บริการ:

- [MET Norway Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
- [MET Norway data model](https://docs.api.met.no/doc/locationforecast/datamodel.html)
- [MET Weather API Terms of Service](https://developer.yr.no/doc/TermsOfService/)
- [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- [Google WeatherNext 3 access guide](https://developers.google.com/weathernext/guides/access-forecast)
- [WeatherNext forecasts on BigQuery](https://developers.google.com/weathernext/guides/bigquery)

ข้อมูลระยะ 7 วันขึ้นไปมีความไม่แน่นอนสูงขึ้นตาม forecast horizon และความละเอียดแบบจำลอง Global ไม่ใช่ความละเอียดระดับหมู่บ้าน การแสดงผลรายหมู่บ้านหมายถึงค่าจากจุดตัวแทนของ polygon เท่านั้น ห้ามตีความเป็นการตรวจวัด ณ ทุกจุดในหมู่บ้าน

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

รายละเอียด audit, architecture และแผน Phase 1–4 อยู่ที่ [docs/radar-architecture.md](docs/radar-architecture.md)
