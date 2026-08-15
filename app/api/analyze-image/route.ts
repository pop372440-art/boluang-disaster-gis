import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Server error: API Key missing' },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const image = body.image;

    if (!image || !image.startsWith('data:')) {
      return NextResponse.json(
        { success: false, error: 'No valid image data provided' },
        { status: 400, headers: corsHeaders }
      );
    }

    const base64Match = image.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!base64Match) {
      return NextResponse.json(
        { success: false, error: 'Invalid image format' },
        { status: 400, headers: corsHeaders }
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    // 🚀 THE REAL FIX: ใช้โมเดลล่าสุด "gemini-3.5-flash" ที่ Google เปิดให้ใช้ฟรี!
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

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
      console.error("Gemini API Error:", data);
      return NextResponse.json(
        { success: false, error: data.error?.message || "Failed to fetch from AI API" },
        { status: 502, headers: corsHeaders }
      );
    }

    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.[0]) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response.' },
        { status: 422, headers: corsHeaders }
      );
    }

    let responseText = candidate.content.parts[0].text;
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let aiData;
    try {
      aiData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse AI JSON response:", responseText);
      return NextResponse.json(
        { success: false, error: 'AI did not return valid JSON format.' },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true, result: aiData },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('🔥 Final AI Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
