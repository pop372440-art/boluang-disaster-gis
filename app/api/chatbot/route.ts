import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;

    // 🛡️ SECURITY 1: ดักจับข้อความว่างเปล่าและจำกัดความยาว (ป้องกัน DoS & Prompt Injection)
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'ข้อความไม่ถูกต้องหรือว่างเปล่า' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json(
        { error: 'ข้อความยาวเกินไป (จำกัดไม่เกิน 500 ตัวอักษร)' }, 
        { status: 413 } // HTTP 413: Payload Too Large
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing Gemini API Key");
    }

    // 🌤️ 1. ให้ Server ไปดึงข้อมูลสภาพอากาศ Real-time จาก OpenMeteo แบบฟรีๆ (พิกัด ต.บ่อหลวง)
    let weatherInfo = "ไม่สามารถดึงข้อมูลได้ชั่วคราว";
    try {
      // แนะนำให้ใส่ Cache ไว้สัก 5 นาที (300 วินาที) เพื่อลดภาระการยิง API ต้นทาง
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,precipitation&timezone=Asia%2FBangkok', { next: { revalidate: 300 } });
      const weatherData = await weatherRes.json();
      
      const temp = weatherData.current?.temperature_2m;
      const rain = weatherData.current?.precipitation;
      
      if (temp !== undefined && rain !== undefined) {
         weatherInfo = `อุณหภูมิปัจจุบัน ${temp}°C, ปริมาณฝน ${rain} มม.`;
      }
    } catch (weatherErr) {
      console.error("Weather API fetch error:", weatherErr);
    }

    // 🤖 2. ส่งข้อมูลไปประมวลผลที่ Gemini API พร้อม System Prompt และ Context สภาพอากาศ
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `คุณคือผู้ช่วย AI อัจฉริยะของเทศบาลตำบลบ่อหลวง จ.เชียงใหม่ ทำหน้าที่ตอบคำถามเรื่องภัยพิบัติและข้อมูลทั่วไปของตำบล
            
            ข้อมูลปัจจุบันเพื่อใช้ประกอบการตอบ: 
            - สภาพอากาศตำบลบ่อหลวง ณ ตอนนี้: ${weatherInfo}
            
            คำถามจากประชาชน: "${message}"
            
            ข้อกำหนด: ให้ตอบคำถามอย่างกระชับ สุภาพ เป็นมิตร และช่วยเหลืออย่างเต็มที่`
          }]
        }]
      })
    });

    if (!geminiRes.ok) {
      throw new Error(`Gemini API Error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'ขออภัย ระบบ AI ไม่สามารถประมวลผลคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้งครับ';

    // 🛡️ SECURITY 2: ส่งคำตอบกลับไปพร้อม HTTP Headers ที่เหมาะสม (CORS) จะถูกจัดการผ่าน next.config.ts ที่ตั้งค่าไว้แล้ว
    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chatbot API Error:", error.message);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
