import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key is missing' }, { status: 500 });
    }

    const body = await req.json();
    const image = body.image;
    if (!image) return NextResponse.json({ success: false, error: 'No image' }, { status: 400 });

    const base64Data = image.split(',')[1];
    const mimeType = image.split(';')[0].split(':')[1];

    // วิ่งตรงเข้าเส้นทางหลักของ Google (v1) ไม่ผ่านไลบรารี
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: `วิเคราะห์รูปภาพนี้อย่างแม่นยำ และตอบเป็น JSON เท่านั้น:\n{\n  "type": "ไฟป่า / หมอกควัน",\n  "severity": 3,\n  "description": "อธิบาย"\n}` },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
       throw new Error(data.error?.message || "Google API Error");
    }

    const responseText = data.candidates[0].content.parts[0].text;
    const cleanText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const aiData = JSON.parse(cleanText);

    return NextResponse.json({ success: true, result: aiData });
  } catch (error: any) {
    // ดัก Error ให้ชื่อเปลี่ยนไป เพื่อเช็คว่าอัปเดตโค้ดสำเร็จจริงไหม
    console.error('🔥 Direct Fetch Error:', error.message);
    return NextResponse.json({ success: false, error: `Direct Fetch Error: ${error.message}` }, { status: 500 });
  }
}
