import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// ⚡ 1. คลัง Cache คำถามยอดนิยม 
const FAQ_CACHE: Record<string, string> = {
  "เบอร์โทร": "ท่านสามารถติดต่อเทศบาลตำบลบ่อหลวงได้ที่เบอร์โทรศัพท์ 053-469-xxx ในวันและเวลาราชการครับ",
  "เบอร์ติดต่อ": "ท่านสามารถติดต่อเทศบาลตำบลบ่อหลวงได้ที่เบอร์โทรศัพท์ 053-469-xxx ในวันและเวลาราชการครับ",
  "แจ้งเหตุ": "สามารถแจ้งเหตุได้ง่ายๆ ที่เมนู 'รายงานเหตุ' หรือสแกน QR Code ที่ติดไว้กับผู้นำชุมชนได้เลยครับ",
  "จุดปลอดภัย": "จุดปลอดภัยและศูนย์พักพิงหลัก ได้แก่ รพ.สต. บ่อหลวง, เทศบาลตำบลบ่อหลวง และโรงเรียนในพื้นที่ (สามารถดูจุด 🛡️ บนแผนที่ได้ครับ)",
  "น้ำท่วม": "สามารถตรวจสอบระดับน้ำและพิกัดน้ำท่วมได้บนแผนที่หลัก หากพบเห็นเหตุสามารถกดปุ่มแจ้งเหตุเพื่อส่งข้อมูลให้เจ้าหน้าที่ได้ทันทีครับ",
  "ไฟป่า": "สถานการณ์ไฟป่าสามารถดูได้จากสัญลักษณ์ 🔥 (จุดความร้อน) และ 🌫️ (ค่าฝุ่น PM2.5) บนแผนที่ครับ"
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: 'ข้อความไม่ถูกต้องหรือว่างเปล่า' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'ข้อความยาวเกินไป' }, { status: 413 });
    }

    // ⚡ 2. ตรวจสอบ Cache ดักคำถามยอดฮิต 
    for (const [key, answer] of Object.entries(FAQ_CACHE)) {
      if (message.includes(key)) {
        return NextResponse.json({ reply: answer });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing Gemini API Key");
    }

    // 🌤️ 3. ดึงสภาพอากาศ (ถอด Timeout ออก เพื่อทดสอบความเสถียรบน Edge Runtime)
    let weatherInfo = "ไม่สามารถดึงข้อมูลได้ชั่วคราว";
    try {
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,precipitation&timezone=Asia%2FBangkok', { 
        next: { revalidate: 300 } 
      });
      
      if (weatherRes.ok) {
        const weatherData = await weatherRes.json();
        const temp = weatherData.current?.temperature_2m;
        const rain = weatherData.current?.precipitation;
        
        if (temp !== undefined && rain !== undefined) {
           weatherInfo = `อุณหภูมิปัจจุบัน ${temp}°C, ปริมาณฝน ${rain} มม.`;
        }
      }
    } catch (weatherErr) {
      console.warn("Weather fetch error:", weatherErr);
      // ไม่ต้อง Throw Error ให้ระบบไปต่อ
    }

    // 🤖 3. เรียกใช้ Gemini API (ปรับปรุง URL เป็นโมเดลเวอร์ชันปัจจุบันเรียบร้อยครับ)
    const geminiRes = await fetch(`https://googleapis.com{apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `คุณคือผู้ช่วย AI ของเทศบาลตำบลบ่อหลวง ทำหน้าที่ตอบคำถามเรื่องภัยพิบัติ
            ข้อมูลสภาพอากาศตำบลบ่อหลวง ณ ตอนนี้: ${weatherInfo}
            คำถามจากประชาชน: "${message}"
            ข้อกำหนด: ให้ตอบสั้นๆ กระชับ สุภาพ เป็นมิตร และช่วยเหลืออย่างเต็มที่`
          }]
        }]
      })
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      throw new Error(`Gemini API Error: ${geminiRes.status} - ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'ขออภัย ระบบไม่สามารถประมวลผลคำตอบได้ในขณะนี้';

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chatbot API Error:", error.message);
    // 🌟 ดัก Error ส่งกลับไปให้น้องต้นสนพูด เพื่อให้เรารู้สาเหตุที่แท้จริง
    return NextResponse.json({ 
        reply: `[แจ้งเตือนทีมพัฒนาระบบ] เกิดข้อผิดพลาดหลังบ้าน: ${error.message}` 
    }, { status: 200 }); 
  }
}
