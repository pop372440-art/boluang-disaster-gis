# แผนสอบเทียบและ validation

1. รับข้อมูลเครื่องวัดฝนอย่างน้อยราย 10–60 นาที พร้อม quality flag และพิกัดสถานี
2. จับคู่ observation กับ forecast run โดยห้ามใช้ข้อมูลอนาคตรั่วเข้าการประเมินย้อนหลัง
3. วัด MAE, bias, RMSE, probability of detection, false alarm ratio และ critical success index แยกตาม lead time/ฤดู/หมู่บ้าน
4. ทดสอบเกณฑ์ watch–critical และจำนวนรอบยืนยันกับเหตุการณ์น้ำหลาก/ดินถล่มที่มีเวลาและตำแหน่งยืนยัน
5. ใช้ backtest แบบแบ่งตามเวลา; ห้ามปรับเกณฑ์และรายงานผลบนชุดเหตุการณ์เดียวกัน
6. เผยแพร่ calibration version, ช่วงข้อมูล, metric และวันที่ทบทวนใน UI ก่อนเรียกเกณฑ์ว่า validated

## แหล่งตรวจวัดจริงที่เชื่อมแล้ว

- ThaiWater/คลังข้อมูลน้ำแห่งชาติ endpoint `rain_24h`
- สถานีบ้านนาฟ่อน (`STN0583`, station ID `1254`) ตำบลบ่อหลวง อำเภอฮอด
- รับเฉพาะค่าที่ต้นทางส่งมาจริงในช่อง `rain_1h` และ `rain_24h`; ค่าที่ขาดจะคงเป็น missing และไม่แปลงเป็นศูนย์
- บันทึก source record ID, หน่วยงาน, พิกัด, เวลา observation, เวลา fetch, payload hash และ quality flag เพื่อ audit ย้อนหลัง
- worker ตรวจ station ID, รหัสสถานี, ตำบล/อำเภอ และค่าพิกัดก่อนเขียนทุกครั้ง หากตัวตนสถานีเปลี่ยนจะหยุด ingestion
- รันทุกชั่วโมงด้วย Supabase Cron และ Edge Function; client ไม่มีสิทธิ์เขียนตาราง observation

ข้อมูลจาก Open-Meteo เป็นข้อมูลแบบจำลองและต้องไม่ถูกเรียกว่าเครื่องวัดหรือใช้เป็น field validation ระบบไม่สร้าง Virtual Station หรือข้อมูลฝนจำลองในตาราง `radar_gauge_observations`
