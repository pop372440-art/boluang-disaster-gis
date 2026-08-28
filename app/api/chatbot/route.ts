import { NextRequest, NextResponse } from 'next/server';

// 🚀 เปลี่ยนเป็น Edge Runtime เพื่อแก้ปัญหา Cold Start (ลดเวลาจาก 14 วิ เหลือ 1-2 วิ)
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;

    // 🛡️ SECURITY 1: ดักจับข้อมูลขยะ
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'ข้อความไม่ถูกต้องหรือว่างเปล่า' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'ข้อความยาวเกินไป (จำกัดไม่เกิน 500 ตัวอักษร)' }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing Gemini API Key");

    // 🌤️ 1. ดึงสภาพอากาศ (ตั้ง Timeout ไว้ 3 วินาที ป้องกัน API ค้างจนแชทบอทตอบช้า)
    let weatherInfo = "ไม่สามารถดึงข้อมูลได้ชั่วคราว";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
      
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,precipitation&timezone=Asia%2FBangkok', { 
        signal: controller.signal,
        next: { revalidate: 300 } 
      });
      clearTimeout(timeoutId);
      
      const weatherData = await weatherRes.json();
      const temp = weatherData.current?.temperature_2m;
      const rain = weatherData.current?.precipitation;
      
      if (temp !== undefined && rain !== undefined) {
         weatherInfo = `อุณหภูมิปัจจุบัน ${temp}°C, ปริมาณฝน ${rain} มม.`;
      }
    } catch (weatherErr) {
      console.warn("Weather fetch skipped due to timeout or error");
    }

    // 🤖 2. เรียกใช้ Gemini API
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `คุณคือผู้ช่วย AI อัจฉริยะของเทศบาลตำบลบ่อหลวง ทำหน้าที่ตอบคำถามเรื่องภัยพิบัติ
            ข้อมูลสภาพอากาศตำบลบ่อหลวง ณ ตอนนี้: ${weatherInfo}
            คำถามจากประชาชน: "${message}"
            ข้อกำหนด: ให้ตอบสั้นๆ กระชับ สุภาพ และช่วยเหลืออย่างเต็มที่`
          }]
        }]
      })
    });

    if (!geminiRes.ok) throw new Error(`Gemini API Error: ${geminiRes.status}`);

    const geminiData = await geminiRes.json();
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'ขออภัย ระบบไม่สามารถประมวลผลคำตอบได้ในขณะนี้';

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chatbot API Error:", error.message);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
