import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://www.gdacs.org/gdacsapi/api/events/geteventlist?eventtypes=TC', {
      // ตั้งค่าไม่ให้แคช เพื่อดึงข้อมูลสดเสมอ
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      // 🚨 ถ้า GDACS ส่ง 404 (ไม่มีพายุ) มา เราจะแอบเปลี่ยนเป็น 200 (Success) แล้วส่งกลับไปให้หน้าเว็บ
      return NextResponse.json({ status: 'CLEAR', data: [] }, { status: 200 });
    }

    const data = await res.json();
    // ✅ ถ้ามีพายุ ก็ส่งข้อมูลกลับไปปกติ
    return NextResponse.json({ status: 'LIVE', data: data }, { status: 200 });

  } catch (error) {
    // กรณีเน็ตเซิร์ฟเวอร์ล่มจริงๆ
    return NextResponse.json({ status: 'ERROR', data: [] }, { status: 200 });
  }
}
