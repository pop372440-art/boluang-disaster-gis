import { NextRequest, NextResponse } from 'next/server';

// 1. กำหนด CORS Headers ไว้ใช้งานร่วมกัน
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // แนะนำให้ใส่ Domain จริงของคุณแทน * เพื่อความปลอดภัยสูงสุด
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 2. จัดการ Preflight Request สำหรับ CORS
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error: Missing API Key' },
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

    // 3. แยก MIME type และ Base64 อย่างปลอดภัยด้วย Regex
    const base64Match = image.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!base64Match) {
      return NextResponse.json(
        { success: false, error: 'Invalid image format' },
        { status: 400, headers: corsHeaders }
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    // ลองเปลี่ยนกลับเป็น v1beta ก่อน เพราะบาง API Key รองรับ v1beta เท่านั้น
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

    // 4. ตรวจสอบว่า Gemini ตอบกลับมาด้วย Error หรือไม่
    if (!response.ok) {
      console.error("Gemini API Error:", data);
      const errMsg = data.error?.message || "Failed to fetch from AI API";
      return NextResponse.json(
        { success: false, error: errMsg },
        { status: 502, headers: corsHeaders } // 502 Bad Gateway แสดงว่าปัญหาอยู่ฝั่ง API ภายนอก
      );
    }

    // 5. ป้องกันการอ่านค่า undefined (Safe Navigation)
    if (!data.candidates || data.candidates.length === 0) {
      console.error("AI returned no candidates. Full response:", data);
      const blockReason = data.promptFeedback?.blockReason || "Unknown reason";
      return NextResponse.json(
        { success: false, error: `AI could not process the image. Reason: ${blockReason}` },
        { status: 422, headers: corsHeaders }
      );
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response.' },
        { status: 422, headers: corsHeaders }
      );
    }

    const responseText = candidate.content.parts[0].text;

    // 6. แปลง String เป็น JSON อย่างปลอดภัย
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

    // 7. ส่งคำตอบกลับพร้อม CORS Headers
    return NextResponse.json(
      { success: true, result: aiData },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('🔥 Final AI Error:', error.message);
    // ส่งข้อความ Error แบบ generic เพื่อไม่ให้รั่วไหลข้อมูลโครงสร้างระบบ
    return NextResponse.json(
      { success: false, error: 'Internal Server Error occurred while processing the image.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
