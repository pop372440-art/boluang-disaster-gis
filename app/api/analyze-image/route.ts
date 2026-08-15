import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    if (!apiKey) throw new Error("API Key is missing");

    const body = await req.json();
    if (!body.image) throw new Error("No image provided");

    const base64Match = body.image.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!base64Match) throw new Error("Invalid image format");

    // ใช้ SDK มาตรฐาน Google จะจัดการเวอร์ชัน v1/v1beta ให้เราเองอัตโนมัติ
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `วิเคราะห์รูปภาพนี้อย่างแม่นยำ และตอบเป็น JSON เท่านั้น:\n{\n  "type": "ไฟป่า / หมอกควัน",\n  "severity": 3,\n  "description": "อธิบายสั้นๆ"\n}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Match[2], mimeType: base64Match[1] } }
    ]);

    let responseText = result.response.text();
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    return NextResponse.json({ success: true, result: JSON.parse(responseText) }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('🔥 Final Bug-Free AI Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
