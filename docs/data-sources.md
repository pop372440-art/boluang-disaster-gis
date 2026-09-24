# แหล่งข้อมูลและ provenance

| ชั้น/ข้อมูล | แหล่ง | บทบาท | ความสดที่ยอมรับ | ข้อจำกัดสำคัญ |
|---|---|---|---|---|
| Radar observation/nowcast | RainViewer | ภาพสถานการณ์และ timeline | stale 20 นาที, expired 40 นาที | ไม่ใช้คำนวณดัชนี |
| พยากรณ์ 1–24 ชม. | Open-Meteo best-match | ดัชนีฝนหลัก | stale 15 นาที, expired 30 นาที | provider เลือกแบบจำลองตามตำแหน่ง |
| Cross-check | MET Norway Locationforecast | เปรียบเทียบที่จุดตัวแทนเดียวกัน | stale 90 นาที, expired 180 นาที | ห้ามเทียบถ้าข้อมูลไม่สด |
| D+7–D+9 | Open-Meteo + MET Norway | วางแผนเท่านั้น | stale 120 นาที, expired 360 นาที | ไม่ใช้ยกระดับ alert |
| หมู่บ้าน/ตำบล | GeoJSON ใน repository | ขอบเขตวิเคราะห์ | versioned with code | CRS โดยนัย EPSG:4326; ต้องเพิ่ม metadata ทางการ |
| ความไวต่อดินถล่ม | GeoJSON ใน repository | overlay เชิงบริบท | versioned with code | class 1 = สูง, class 2 = ปานกลาง |

ทุก snapshot ที่นำไปเก็บต้องมี source, model (ถ้าทราบ), model run, fetched time, freshness และ payload hash เพื่อย้อนตรวจได้ ห้ามตีความคำว่า “ล่าสุด” โดยไม่มี timestamp
