import { NextRequest, NextResponse } from 'next/server';
import {
  getIncidentAiPublicError,
  INCIDENT_RISK_TYPES,
  parseIncidentAiResult
} from '@/lib/incident-ai';

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_BASE64_LENGTH = 8 * 1024 * 1024;
const DEFAULT_MODEL = 'gemini-3.5-flash';

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[incident-ai] configuration missing', { requestId, code: 'API_KEY_MISSING' });
      return NextResponse.json(
        {
          success: false,
          code: 'CONFIGURATION_ERROR',
          message: 'ระบบ AI ยังไม่พร้อมใช้งาน กรุณาระบุข้อมูลด้วยตนเองและแจ้งผู้ดูแลระบบ'
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const image = typeof body.image === 'string' ? body.image : '';

    if (!image || !image.startsWith('data:')) {
      return NextResponse.json(
        { success: false, code: 'INVALID_IMAGE', message: 'ไม่พบข้อมูลรูปภาพที่ถูกต้อง' },
        { status: 400, headers: corsHeaders }
      );
    }

    const base64Match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!base64Match) {
      return NextResponse.json(
        { success: false, code: 'UNSUPPORTED_IMAGE', message: 'รองรับเฉพาะรูป JPG, PNG หรือ WebP' },
        { status: 400, headers: corsHeaders }
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    if (base64Data.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { success: false, code: 'IMAGE_TOO_LARGE', message: 'รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปใหม่' },
        { status: 413, headers: corsHeaders }
      );
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `วิเคราะห์เหตุการณ์ที่มองเห็นในภาพสำหรับระบบแจ้งเหตุเทศบาลตำบลบ่อหลวง
- เลือกประเภทเหตุจาก schema ที่กำหนดเท่านั้น
- บรรยายเฉพาะสิ่งที่เห็น ห้ามเดาชื่อ บุคคล สถานที่ หรือข้อมูลส่วนบุคคล
- หากเห็นต้นไม้หรือกิ่งไม้ล้ม กีดขวาง หรือมีการตัดเพื่อเปิดทาง ให้เลือก "ต้นไม้ล้มขวางทาง"
- ระดับ 1 = เล็กน้อย, 2 = เริ่มกระทบ, 3 = ต้องส่งเจ้าหน้าที่ตรวจสอบ, 4 = กระทบคนหรือทรัพย์สินรุนแรง, 5 = อันตรายต่อชีวิตทันที
- หากภาพไม่ตรงกับประเภทอื่น ให้เลือก "อื่นๆ" และอธิบายสิ่งที่เห็นอย่างตรงไปตรงมา`
            },
            {
              inlineData: { mimeType: mimeType, data: base64Data }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: INCIDENT_RISK_TYPES },
            severity: { type: 'integer', minimum: 1, maximum: 5 },
            description: { type: 'string', minLength: 5, maxLength: 500 }
          },
          required: ['type', 'severity', 'description'],
          additionalProperties: false
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000)
    });

    const data = await response.json();

    if (!response.ok) {
      const publicError = getIncidentAiPublicError(response.status);
      console.error('[incident-ai] provider request failed', {
        requestId,
        model,
        status: response.status,
        code: publicError.code,
        providerStatus: data?.error?.status
      });
      return NextResponse.json(
        { success: false, ...publicError },
        { status: 502, headers: corsHeaders }
      );
    }

    const candidate = data.candidates?.[0];
    const responseText = candidate?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();

    if (!responseText) {
      console.warn('[incident-ai] provider returned no content', {
        requestId,
        model,
        finishReason: candidate?.finishReason,
        blockReason: data.promptFeedback?.blockReason
      });
      return NextResponse.json(
        {
          success: false,
          code: 'NO_RESULT',
          message: 'AI ยังสรุปภาพนี้ไม่ได้ กรุณาลองอีกครั้งหรือระบุข้อมูลด้วยตนเอง'
        },
        { status: 422, headers: corsHeaders }
      );
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[incident-ai] response contained no JSON object', { requestId, model });
      return NextResponse.json(
        { success: false, code: 'INVALID_RESULT', message: 'AI ส่งผลลัพธ์ไม่สมบูรณ์ กรุณาลองวิเคราะห์อีกครั้ง' },
        { status: 502, headers: corsHeaders }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn('[incident-ai] response JSON parse failed', { requestId, model });
      return NextResponse.json(
        { success: false, code: 'INVALID_RESULT', message: 'AI ส่งผลลัพธ์ไม่สมบูรณ์ กรุณาลองวิเคราะห์อีกครั้ง' },
        { status: 502, headers: corsHeaders }
      );
    }

    const aiData = parseIncidentAiResult(parsed);
    if (!aiData) {
      console.warn('[incident-ai] response failed schema validation', { requestId, model });
      return NextResponse.json(
        { success: false, code: 'INVALID_RESULT', message: 'AI ส่งผลลัพธ์ไม่ตรงกับแบบฟอร์ม กรุณาลองวิเคราะห์อีกครั้ง' },
        { status: 502, headers: corsHeaders }
      );
    }

    console.info('[incident-ai] analysis completed', {
      requestId,
      model,
      type: aiData.type,
      severity: aiData.severity
    });
    return NextResponse.json(
      { success: true, result: aiData },
      { headers: corsHeaders }
    );

  } catch (error: unknown) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    console.error('[incident-ai] request failed', {
      requestId,
      code: isTimeout ? 'TIMEOUT' : 'UNEXPECTED_ERROR',
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      {
        success: false,
        code: isTimeout ? 'TIMEOUT' : 'UNEXPECTED_ERROR',
        message: isTimeout
          ? 'AI ใช้เวลานานเกินไป กรุณาลองวิเคราะห์อีกครั้ง'
          : 'เกิดข้อผิดพลาดขณะวิเคราะห์ภาพ กรุณาลองใหม่หรือระบุข้อมูลด้วยตนเอง'
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
