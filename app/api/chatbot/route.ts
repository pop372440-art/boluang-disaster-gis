import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing Gemini API Key");
    }

    // 🌤️ 1. ให้ Server ไปดึงข้อมูลสภาพอากาศ Real-time จาก OpenMeteo แบบฟรีๆ (พิกัด ต.บ่อหลวง)
    let weatherInfo = "ไม่สามารถดึงข้อมูลได้ชั่วคราว";
    try {
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,precipitation&timezone=Asia%2FBangkok');
      const weatherData = await weatherRes.json();
      const temp = weatherData.current?.temperature_2m;
      const rain = weatherData.current?.precipitation;
      
      // แปลงข้อมูลให้อ่านง่าย
      weatherInfo = `อุณหภูมิปัจจุบัน ${temp} องศาเซลเซียส, ปริมาณฝน ${rain} มิลลิเมตร`;
    } catch (e) {
      console.error("Weather API Error:", e);
    }

    // 🧠 2. แอบกระซิบ (Inject) ข้อมูลสภาพอากาศใส่เข้าไปในสมองของ AI ผ่าน System Instruction
    const systemContext = `
      คุณคือ "ผู้ช่วยบ่อหลวง" (Bo Luang Smart Helper) AI ประจำเทศบาลตำบลบ่อหลวง จ.เชียงใหม่
      หน้าที่ของคุณคือตอบคำถามประชาชนด้วยความสุภาพ กระชับ และเป็นมิตร

      🚨 ข้อมูลสภาพอากาศแบบ Real-time ณ ขณะนี้ (อัปเดตวินาทีนี้):
      ${weatherInfo}
      (คำสั่งพิเศษ: หากมีคนถามเรื่องสภาพอากาศ ให้อ้างอิงตัวเลขนี้ไปตอบได้เลย และถ้าฝนตกเกิน 10mm ให้เตือนประชาชนเรื่องเฝ้าระวังน้ำป่าไหลหลากด้วย)

      📍 ข้อมูลสำคัญของพื้นที่:
      - มี 13 หมู่บ้าน (เช่น บ้านแม่สะนาม, บ้านแม่หืด, บ้านขุน, บ้านพุย, บ้านเตียนอาง ฯลฯ)
      - เบอร์โทรฉุกเฉินเทศบาล: 053-XXXXXX, เบอร์กู้ชีพ: 1669
      - หากเกิดเหตุภัยพิบัติ แผนอพยพหลักคือให้ประชาชนไปรวมตัวที่ "โรงเรียนบ่อหลวงวิทยา" หรือจุดปลอดภัยประจำหมู่บ้าน
      - แจ้งเหตุได้ผ่านเว็บแอปพลิเคชันนี้ได้ทันทีตลอด 24 ชม.

      จงตอบคำถามต่อไปนี้จากประชาชน (ทำตัวเป็นธรรมชาติ ไม่ต้องบอกว่าดึงข้อมูลมาจากไหน):
    `;

    // 🚀 3. ส่งข้อมูลทั้งหมดไปให้ Gemini ประมวลผล
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: `${systemContext}\n\nคำถามจากประชาชน: ${message}` }] }],
    };

    const response = await fetch(url, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(payload) 
    });
    
    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error("Chatbot API Error:", error);
    return NextResponse.json({ 
      success: false, 
      reply: "ขออภัยครับ ขณะนี้ระบบผู้ช่วยบ่อหลวงกำลังปรับปรุง กรุณาลองใหม่อีกครั้งครับ 🤖" 
    });
  }
}
