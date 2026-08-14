import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is missing' }, { status: 500 });
    }

    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 });
    }

    // แยกรหัส Base64
    const mimeType = image.split(';')[0].split(':')[1];
    const base64Data = image.split(',')[1];

    // 🚀 ท่าไม้ตาย: ยิงตรงเข้า Google API ไม่ผ่านไลบรารี (ใช้ gemini-1.5-flash)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // จัดรูปก้อนข้อมูล (Payload) ชงเองส่งเอง
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `วิเคราะห์รูปภาพนี้อย่างแม่นยำ และต้องตอบกลับมาเป็น JSON เท่านั้น ห้ามพิมพ์ข้อความอธิบายใดๆ ทั้งสิ้น\nรูปแบบ:\n{\n  "type": "เลือก 1 อย่าง: ไฟป่า / หมอกควัน, ดินโคลนถล่ม / ดินสไลด์, น้ำป่าไหลหลาก / น้ำท่วม, ต้นไม้ล้มขวางทาง, แผ่นดินไหว, อื่นๆ",\n  "severity": ระดับความรุนแรง 1 ถึง 5 (ให้ตอบเป็นตัวเลขเท่านั้น),\n  "description": "อธิบายสิ่งที่เห็นในรูปภาพสั้นๆ ไม่เกิน 2 บรรทัด"\n}`
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json" // บังคับออก JSON 100%
      }
    };

    // ใช้คำสั่ง fetch ธรรมดาคุยกับเซิร์ฟเวอร์
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Google API Error: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    // แกะกล่องเอาคำตอบออกมา
    const responseText = data.candidates[0].content.parts[0].text;
    const aiData = JSON.parse(responseText);

    return NextResponse.json({ success: true, result: aiData });

  } catch (error: any) {
    console.error('🔥 Ultimate AI API Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
