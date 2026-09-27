import { NextRequest, NextResponse } from 'next/server';
import {
  getIncidentAiPublicError,
  INCIDENT_RISK_TYPES,
  parseIncidentAiResult,
  shouldUseIncidentAiFallback,
  type IncidentAiResult
} from '@/lib/incident-ai';

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_BASE64_LENGTH = 8 * 1024 * 1024;
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
const INCIDENT_PROMPT = `วิเคราะห์เหตุการณ์ที่มองเห็นในภาพสำหรับระบบแจ้งเหตุเทศบาลตำบลบ่อหลวง
- เลือกประเภทเหตุจาก schema ที่กำหนดเท่านั้น
- บรรยายเฉพาะสิ่งที่เห็น ห้ามเดาชื่อ บุคคล สถานที่ หรือข้อมูลส่วนบุคคล
- หากเห็นต้นไม้หรือกิ่งไม้ล้ม กีดขวาง หรือมีการตัดเพื่อเปิดทาง ให้เลือก "ต้นไม้ล้มขวางทาง"
- ระดับ 1 = เล็กน้อย, 2 = เริ่มกระทบ, 3 = ต้องส่งเจ้าหน้าที่ตรวจสอบ, 4 = กระทบคนหรือทรัพย์สินรุนแรง, 5 = อันตรายต่อชีวิตทันที
- หากภาพไม่ตรงกับประเภทอื่น ให้เลือก "อื่นๆ" และอธิบายสิ่งที่เห็นอย่างตรงไปตรงมา`;

const INCIDENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: INCIDENT_RISK_TYPES },
    severity: { type: 'integer', minimum: 1, maximum: 5 },
    description: { type: 'string', minLength: 5, maxLength: 500 }
  },
  required: ['type', 'severity', 'description'],
  additionalProperties: false
} as const;

type ProviderName = 'gemini' | 'groq';
type ProviderSuccess = {
  ok: true;
  provider: ProviderName;
  model: string;
  result: IncidentAiResult;
};
type ProviderFailure = {
  ok: false;
  provider: ProviderName;
  model: string;
  status: number;
  code: string;
  message: string;
};
type ProviderResult = ProviderSuccess | ProviderFailure;

function parseProviderJson(responseText: string): IncidentAiResult | null {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return parseIncidentAiResult(JSON.parse(jsonMatch[0]));
  } catch {
    return null;
  }
}

function providerFailure(
  provider: ProviderName,
  model: string,
  status: number,
  code?: string,
  message?: string
): ProviderFailure {
  const publicError = getIncidentAiPublicError(status);
  return {
    ok: false,
    provider,
    model,
    status,
    code: code || publicError.code,
    message: message || publicError.message
  };
}

async function analyzeWithGemini(mimeType: string, base64Data: string): Promise<ProviderResult> {
  const provider = 'gemini' as const;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return providerFailure(provider, model, 500, 'CONFIGURATION_ERROR', 'ระบบ AI หลักยังไม่พร้อมใช้งาน');
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: INCIDENT_PROMPT },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: INCIDENT_RESPONSE_SCHEMA
        }
      }),
      signal: AbortSignal.timeout(25_000)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const failure = providerFailure(provider, model, response.status);
      console.error('[incident-ai] provider request failed', {
        provider,
        model,
        status: response.status,
        code: failure.code,
        providerStatus: data?.error?.status
      });
      return failure;
    }

    const candidate = data?.candidates?.[0];
    const responseText = candidate?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();
    if (!responseText) {
      return providerFailure(provider, model, 422, 'NO_RESULT', 'AI ยังสรุปภาพนี้ไม่ได้ กรุณาลองอีกครั้งหรือระบุข้อมูลด้วยตนเอง');
    }

    const result = parseProviderJson(responseText);
    if (!result) {
      return providerFailure(provider, model, 502, 'INVALID_RESULT', 'AI ส่งผลลัพธ์ไม่ตรงกับแบบฟอร์ม กรุณาลองวิเคราะห์อีกครั้ง');
    }

    return { ok: true, provider, model, result };
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return providerFailure(
      provider,
      model,
      500,
      isTimeout ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      isTimeout ? 'AI ใช้เวลานานเกินไป กรุณาลองวิเคราะห์อีกครั้ง' : 'ผู้ให้บริการ AI ขัดข้องชั่วคราว กรุณาลองใหม่หรือระบุข้อมูลด้วยตนเอง'
    );
  }
}

async function analyzeWithGroq(imageDataUrl: string): Promise<ProviderResult> {
  const provider = 'groq' as const;
  const model = process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_MODEL;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return providerFailure(provider, model, 500, 'CONFIGURATION_ERROR', 'ระบบ AI สำรองยังไม่พร้อมใช้งาน');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: INCIDENT_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }],
        temperature: 0.1,
        max_completion_tokens: 400,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'incident_analysis',
            strict: true,
            schema: INCIDENT_RESPONSE_SCHEMA
          }
        }
      }),
      signal: AbortSignal.timeout(20_000)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const failure = providerFailure(provider, model, response.status);
      console.error('[incident-ai] provider request failed', {
        provider,
        model,
        status: response.status,
        code: failure.code,
        providerCode: data?.error?.code
      });
      return failure;
    }

    const responseText = data?.choices?.[0]?.message?.content;
    if (typeof responseText !== 'string' || !responseText.trim()) {
      return providerFailure(provider, model, 422, 'NO_RESULT', 'AI สำรองยังสรุปภาพนี้ไม่ได้ กรุณาระบุข้อมูลด้วยตนเอง');
    }

    const result = parseProviderJson(responseText);
    if (!result) {
      return providerFailure(provider, model, 502, 'INVALID_RESULT', 'AI สำรองส่งผลลัพธ์ไม่ตรงกับแบบฟอร์ม กรุณาระบุข้อมูลด้วยตนเอง');
    }

    return { ok: true, provider, model, result };
  } catch (error: unknown) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return providerFailure(
      provider,
      model,
      500,
      isTimeout ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      isTimeout ? 'AI สำรองใช้เวลานานเกินไป กรุณาระบุข้อมูลด้วยตนเอง' : 'ผู้ให้บริการ AI สำรองขัดข้องชั่วคราว กรุณาระบุข้อมูลด้วยตนเอง'
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
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

    const [, mimeType, base64Data] = base64Match;
    if (base64Data.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { success: false, code: 'IMAGE_TOO_LARGE', message: 'รูปมีขนาดใหญ่เกินไป กรุณาเลือกรูปใหม่' },
        { status: 413, headers: corsHeaders }
      );
    }

    const primaryResult = await analyzeWithGemini(mimeType, base64Data);
    if (primaryResult.ok) {
      console.info('[incident-ai] analysis completed', {
        requestId,
        provider: primaryResult.provider,
        model: primaryResult.model,
        type: primaryResult.result.type,
        severity: primaryResult.result.severity,
        fallbackUsed: false
      });
      return NextResponse.json(
        { success: true, result: primaryResult.result, provider: primaryResult.provider, fallbackUsed: false },
        { headers: corsHeaders }
      );
    }

    if (process.env.GROQ_API_KEY && shouldUseIncidentAiFallback(primaryResult.code)) {
      console.warn('[incident-ai] switching to fallback provider', {
        requestId,
        from: primaryResult.provider,
        to: 'groq',
        reason: primaryResult.code
      });
      const fallbackResult = await analyzeWithGroq(image);
      if (fallbackResult.ok) {
        console.info('[incident-ai] analysis completed', {
          requestId,
          provider: fallbackResult.provider,
          model: fallbackResult.model,
          type: fallbackResult.result.type,
          severity: fallbackResult.result.severity,
          fallbackUsed: true
        });
        return NextResponse.json(
          { success: true, result: fallbackResult.result, provider: fallbackResult.provider, fallbackUsed: true },
          { headers: corsHeaders }
        );
      }

      console.error('[incident-ai] all providers failed', {
        requestId,
        primaryCode: primaryResult.code,
        fallbackCode: fallbackResult.code
      });
      return NextResponse.json(
        { success: false, code: fallbackResult.code, message: fallbackResult.message, attemptedProviders: ['gemini', 'groq'] },
        { status: 502, headers: corsHeaders }
      );
    }

    console.error('[incident-ai] analysis failed without fallback', {
      requestId,
      provider: primaryResult.provider,
      code: primaryResult.code,
      fallbackConfigured: Boolean(process.env.GROQ_API_KEY)
    });
    return NextResponse.json(
      { success: false, code: primaryResult.code, message: primaryResult.message },
      { status: 502, headers: corsHeaders }
    );
  } catch (error: unknown) {
    console.error('[incident-ai] invalid request', {
      requestId,
      code: 'INVALID_REQUEST',
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { success: false, code: 'INVALID_REQUEST', message: 'คำขอวิเคราะห์ภาพไม่ถูกต้อง กรุณาลองใหม่' },
      { status: 400, headers: corsHeaders }
    );
  }
}
