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

## สถานะการรับรองเกณฑ์

สถานะปัจจุบันคือ `collecting_real_observations` หรือ “กำลังสะสมข้อมูลจริง” และต้องแสดงในหน้า Radar ว่าเกณฑ์ยังไม่ผ่านการยืนยัน ห้ามเปลี่ยนเป็น `validated` จนกว่าจะครบทุกข้อ:

1. มีข้อมูลตรวจวัดครอบคลุมฤดูฝนอย่างน้อยหนึ่งฤดูและมีช่วงฝนหนักจริงเพียงพอสำหรับแยกผลตาม lead time
2. มีเหตุการณ์ภาคสนามที่ยืนยันเวลา พิกัด หมู่บ้าน ประเภทเหตุ ระดับผลกระทบ และผู้ตรวจสอบ โดยแยก “ไม่เกิดเหตุ” ออกจาก “ไม่มีรายงาน”
3. จับคู่ forecast snapshot, radar observation, gauge observation และ field event โดยใช้ข้อมูลที่มีอยู่ ณ เวลาตัดสินใจเท่านั้น
4. รายงาน MAE, bias, RMSE, probability of detection, false alarm ratio, critical success index และ lead time แยกตามหมู่บ้าน/ฤดู
5. แบ่งชุดข้อมูลตามเวลาเป็น calibration และ holdout validation ห้ามปรับเกณฑ์จากผลชุด holdout
6. คณะทำงานรับรอง calibration version, ช่วงข้อมูล, metric, ข้อจำกัด และวันที่ทบทวน พร้อมบันทึก audit trail

หน้า public แสดงได้เฉพาะค่าฝนล่าสุด ตัวตนสถานี หน่วยงาน เวลา observation/fetch, quality flag และจำนวน observation เท่านั้น ส่วน raw payload hash, source record ID และ ingestion error detail ยังคงเป็นข้อมูลภายใน
