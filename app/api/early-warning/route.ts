import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    // 1. ดึงข้อมูลสภาพอากาศจริงของ ต.บ่อหลวง (ใช้ OpenMeteo ฟรี ไม่ต้องสมัคร Key)
    const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=precipitation,rain&timezone=Asia%2FBangkok');
    const weatherData = await weatherRes.json();
    const currentRain = weatherData.current?.precipitation || 0;

    // 2. ส่งให้ Gemini ประเมินความเสี่ยง
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{ 
          text: `วิเคราะห์ข้อมูลสภาพอากาศ ต.บ่อหลวง จ.เชียงใหม่ ปัจจุบันมีปริมาณฝนสะสม ${currentRain} mm.\nให้ประเมินความเสี่ยงดินโคลนถล่มและน้ำป่า ตอบกลับเป็น JSON เท่านั้น:\n{"level": <ตัวเลข 1 ถึง 5>, "message": "คำเตือนสั้นๆ กระชับ"}\n\n*เกณฑ์: ถ้าฝน 0 mm ให้ตอบ level 1 (ปกติ), ถ้าเกิน 10mm ให้ level 3, ถ้าเกิน 30mm ให้ level 4-5` 
        }]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };

    const aiRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const aiData = await aiRes.json();
    const text = aiData.candidates[0].content.parts[0].text;
    
    // ใช้ Regex ดูดเฉพาะ JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch![0]);

    return NextResponse.json({ success: true, ...result, rain: currentRain });
  } catch (error: any) {
    console.error("Early Warning Error:", error);
    // Fallback ป้องกันเว็บพัง
    return NextResponse.json({ success: false, level: 1, message: "ระบบเฝ้าระวังแสตนด์บาย", rain: 0 });
  }
}
