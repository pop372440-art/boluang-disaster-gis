# แผนสอบเทียบและ validation

1. รับข้อมูลเครื่องวัดฝนอย่างน้อยราย 10–60 นาที พร้อม quality flag และพิกัดสถานี
2. จับคู่ observation กับ forecast run โดยห้ามใช้ข้อมูลอนาคตรั่วเข้าการประเมินย้อนหลัง
3. วัด MAE, bias, RMSE, probability of detection, false alarm ratio และ critical success index แยกตาม lead time/ฤดู/หมู่บ้าน
4. ทดสอบเกณฑ์ watch–critical และจำนวนรอบยืนยันกับเหตุการณ์น้ำหลาก/ดินถล่มที่มีเวลาและตำแหน่งยืนยัน
5. ใช้ backtest แบบแบ่งตามเวลา; ห้ามปรับเกณฑ์และรายงานผลบนชุดเหตุการณ์เดียวกัน
6. เผยแพร่ calibration version, ช่วงข้อมูล, metric และวันที่ทบทวนใน UI ก่อนเรียกเกณฑ์ว่า validated

ตาราง `radar_gauge_observations` รองรับ ingestion แต่ระบบจะไม่สร้างข้อมูลสถานีจำลอง เมื่อมีสิทธิ์เข้าถึงแหล่งจริงจึงค่อยเชื่อม worker และเพิ่ม ensemble spread สำหรับ D+7–D+9
