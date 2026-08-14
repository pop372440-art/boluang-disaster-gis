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

    const mimeType = image.split(';')[0].split(':')[1];
    const base64Data = image.split(',')[1];

    // 🚀 เปลี่ยน URL จาก v1beta เป็น v1 (ช่องทางหลักที่ชัวร์ที่สุด)
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `วิเคราะห์รูปภาพนี้อย่างแม่นยำ และตอบเป็น JSON เท่านั้น:\n{\n  "type": "ไฟป่า / หมอกควัน",\n  "severity": 3,\n  "description": "อธิบายสั้นๆ"\n}`
            },
            {
              inlineData: { mimeType: mimeType, data: base64Data }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API Response Error:", data);
      throw new Error(data.error?.message || "Unknown API Error");
    }

    const responseText = data.candidates[0].content.parts[0].text;
    const aiData = JSON.parse(responseText);

    return NextResponse.json({ success: true, result: aiData });

  } catch (error: any) {
    console.error('🔥 Final AI Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
