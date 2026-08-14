import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ success: false, error: 'No image provided' }, { status: 400 });
    }

    // แยกรหัส Base64 และ MimeType ออกจาก Data URL
    const mimeType = image.split(';')[0].split(':')[1];
    const base64Data = image.split(',')[1];

    // 🚀 ปลดล็อก Safety Settings เพื่อให้ AI สามารถวิเคราะห์รูปภัยพิบัติได้
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ]
    });

    // 🚀 ปรับ Prompt ให้บังคับตอบแค่ JSON จริงๆ ป้องกันระบบพัง
    const prompt = `
      คุณคือระบบ AI ผู้เชี่ยวชาญด้านภัยพิบัติของเทศบาลตำบลบ่อหลวง จงวิเคราะห์รูปภาพนี้แล้วตอบกลับมาเป็น JSON เท่านั้น (ห้ามมีข้อความอื่นเด็ดขาด)
      รูปแบบ JSON ที่บังคับใช้:
      {
        "type": "เลือก 1 อย่างจาก: ไฟป่า / หมอกควัน, ดินโคลนถล่ม / ดินสไลด์, น้ำป่าไหลหลาก / น้ำท่วม, ต้นไม้ล้มขวางทาง, แผ่นดินไหว, อื่นๆ",
        "severity": ให้คะแนนความรุนแรง 1 ถึง 5 (เป็นตัวเลข),
        "description": "คำอธิบายสิ่งที่เห็นสั้นๆ ไม่เกิน 2 บรรทัด"
      }
      ถ้าไม่แน่ใจ หรือมองไม่ชัด ให้ตอบ type เป็น "อื่นๆ" และ severity เป็น 1
    `;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    
    // คลีน Text เผื่อ AI ตอบกลับมามี Markdown หรือตัวอักษรขยะ
    let cleanJsonString = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // แปลงข้อความเป็น JSON Object
    const aiData = JSON.parse(cleanJsonString);

    return NextResponse.json({ success: true, result: aiData });

  } catch (error: any) {
    console.error('AI Analysis Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
