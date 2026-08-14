import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    // 1. เช็คว่ามี API Key ใน Vercel ไหม
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Vercel Error: GEMINI_API_KEY is missing");
      return NextResponse.json({ success: false, error: 'API Key is missing' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 });
    }

    // 2. แยกรหัส Base64
    const mimeType = image.split(';')[0].split(':')[1];
    const base64Data = image.split(',')[1];

    // 3. เอา generationConfig ออกเพื่อแก้ปัญหา Vercel Deploy ไม่ผ่าน (Type Error)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });

    const prompt = `
      วิเคราะห์รูปภาพนี้อย่างแม่นยำ และต้องตอบกลับมาเป็น JSON เท่านั้น ห้ามพิมพ์ข้อความอธิบายใดๆ ทั้งสิ้น
      รูปแบบ:
      {
        "type": "เลือก 1 อย่าง: ไฟป่า / หมอกควัน, ดินโคลนถล่ม / ดินสไลด์, น้ำป่าไหลหลาก / น้ำท่วม, ต้นไม้ล้มขวางทาง, แผ่นดินไหว, อื่นๆ",
        "severity": ระดับความรุนแรง 1 ถึง 5 (ให้ตอบเป็นตัวเลขเท่านั้น),
        "description": "อธิบายสิ่งที่เห็นในรูปภาพสั้นๆ ไม่เกิน 2 บรรทัด"
      }
    `;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    
    // 4. 🚀 ท่าไม้ตาย: ใช้ Regex ดูดเอาเฉพาะก้อน JSON (จาก { ถึง }) ป้องกัน AI แถมข้อความขยะ
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("AI ตอบกลับมาไม่เป็นรูปแบบ JSON");
    }

    const aiData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, result: aiData });

  } catch (error: any) {
    console.error('🔥 AI Analysis Error Details:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
