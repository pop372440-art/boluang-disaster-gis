import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server error: GEMINI_API_KEY is missing',
        },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    const body = await req.json();
    const image = body?.image;

    if (typeof image !== 'string' || !image.startsWith('data:')) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid image data provided',
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const base64Match = image.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!base64Match) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid image data URL format',
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
    ];

    if (!allowedMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported image type: ${mimeType}`,
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log('Image received:', {
      mimeType,
      base64Length: base64Data.length,
    });

    const url =
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: `
คุณเป็นระบบวิเคราะห์ภาพสำหรับตรวจจับไฟป่าและหมอกควัน

โปรดวิเคราะห์ "ภาพที่ได้รับจริง" เท่านั้น
ห้ามเดาจาก prompt และห้าม assume ว่าภาพเป็นไฟป่า

จำแนก type ได้เพียง:
- wildfire: พบเปลวไฟหรือหลักฐานของไฟป่าชัดเจน
- smoke_haze: พบควันหรือหมอกควัน แต่ไม่เห็นเปลวไฟชัดเจน
- normal: ไม่พบไฟป่าหรือหมอกควันที่มีนัยสำคัญ
- uncertain: ภาพไม่ชัด, มืด, ถูกบัง, หรือหลักฐานไม่เพียงพอ

กำหนด severity:
0 = ไม่มีเหตุการณ์
1 = เล็กน้อย
2 = ปานกลาง
3 = รุนแรง

ให้ประเมิน severity จากสิ่งที่เห็นในภาพจริง เช่น
ขนาดของไฟ, ความหนาแน่นของควัน,
พื้นที่ที่ได้รับผลกระทบ และความรุนแรงที่มองเห็นได้

description ให้บรรยายสิ่งที่เห็นในภาพสั้น ๆ
ห้ามสร้างข้อมูลที่ไม่มีอยู่ในภาพ
              `.trim(),
            },
          ],
        },
      ],

      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            type: {
              type: 'STRING',
              enum: [
                'wildfire',
                'smoke_haze',
                'normal',
                'uncertain',
              ],
            },
            severity: {
              type: 'INTEGER',
            },
            description: {
              type: 'STRING',
            },
          },
          required: [
            'type',
            'severity',
            'description',
          ],
        },
        temperature: 0.1,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log(
      'Gemini response:',
      JSON.stringify(data, null, 2)
    );

    if (!response.ok) {
      const errMsg =
        data?.error?.message ||
        'Failed to fetch from Gemini API';

      return NextResponse.json(
        {
          success: false,
          error: errMsg,
        },
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    const candidate = data?.candidates?.[0];

    if (!candidate) {
      const blockReason =
        data?.promptFeedback?.blockReason ||
        'Unknown reason';

      return NextResponse.json(
        {
          success: false,
          error: `AI could not process the image: ${blockReason}`,
        },
        {
          status: 422,
          headers: corsHeaders,
        }
      );
    }

    const parts = candidate?.content?.parts || [];

    const textPart = parts.find(
      (part: any) => typeof part.text === 'string'
    );

    if (!textPart?.text) {
      return NextResponse.json(
        {
          success: false,
          error: 'AI returned no text response',
          finishReason: candidate?.finishReason || null,
        },
        {
          status: 422,
          headers: corsHeaders,
        }
      );
    }

    let aiData;

    try {
      aiData = JSON.parse(textPart.text);
    } catch (error) {
      console.error(
        'Invalid JSON from Gemini:',
        textPart.text
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Gemini returned invalid JSON',
          raw: textPart.text,
        },
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        result: aiData,
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error: any) {
    console.error('Final AI Error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          'Internal Server Error',
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
