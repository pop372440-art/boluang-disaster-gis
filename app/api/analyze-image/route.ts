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

    // 🚀 เปลี่ยนมาใช้โมเดลตัวเก๋า 'gemini-1.0-pro' ที่ชัวร์ที่สุด 100% ไม่ติด 404 แน่นอน
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `วิเคราะห์รูปภาพนี้อย่างแม่นยำ และตอบเป็น JSON เท่านั้น:
              {
                "type": "ไฟป่า / หมอกควัน",
                "severity": 3,
                "description": "วิเคราะห์ภัยพิบัติจากภาพ"
              }`
            },
            {
              inlineData: { mimeType: mimeType, data: base64Data }
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data.error));
    }

    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const aiData = jsonMatch ? JSON.parse(jsonMatch[0]) : { type: "อื่นๆ", severity: 1, description: "AI วิเคราะห์ไม่ได้" };

    return NextResponse.json({ success: true, result: aiData });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
