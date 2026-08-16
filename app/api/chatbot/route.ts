import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    // บริบทข้อมูล Smart City (แก้ไขเพิ่มข้อมูลเบอร์โทรหรือชื่อสถานที่ได้เลยครับ)
    const systemContext = `
      คุณคือ "ผู้ช่วยบ่อหลวง" (Bo Luang Smart Helper) AI ประจำเทศบาลตำบลบ่อหลวง จ.เชียงใหม่
      หน้าที่ของคุณคือตอบคำถามประชาชนด้วยความสุภาพ กระชับ และเป็นมิตร
      ข้อมูลสำคัญของพื้นที่:
      - มี 13 หมู่บ้าน (เช่น บ้านแม่สะนาม, บ้านแม่หืด, บ้านขุน, บ้านพุย, บ้านเตียนอาง ฯลฯ)
      - เบอร์โทรฉุกเฉินเทศบาล: 053-XXXXXX, เบอร์กู้ชีพ: 1669
      - หากเกิดเหตุภัยพิบัติ แผนอพยพหลักคือให้ประชาชนไปรวมตัวที่ "โรงเรียนบ่อหลวงวิทยา" หรือจุดปลอดภัยประจำหมู่บ้าน
      - แจ้งเหตุได้ผ่านเว็บแอปพลิเคชันนี้ได้ทันทีตลอด 24 ชม.
      จงตอบคำถามต่อไปนี้จากประชาชน:
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: `${systemContext}\n\nคำถาม: ${message}` }] }],
    };

    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    return NextResponse.json({ success: false, reply: "ขออภัยครับ ขณะนี้ระบบผู้ช่วยบ่อหลวงกำลังปรับปรุง กรุณาลองใหม่อีกครั้งครับ" });
  }
}
