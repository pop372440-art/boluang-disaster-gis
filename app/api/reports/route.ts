import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// เปลี่ยน Runtime เป็น Edge เพื่อให้ API โหลดเร็วที่สุด
export const runtime = 'edge';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // ดึงเฉพาะข้อมูลที่เปิดเผยได้ (ไม่ดึงชื่อผู้แจ้งเพื่อป้องกัน PDPA)
    const { data, error } = await supabase
      .from('boluang_disaster_reports')
      .select('tracking_code, risk_type, severity_level, latitude, longitude, village_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100); // จำกัดแค่ 100 รายการล่าสุดเพื่อประสิทธิภาพ

    if (error) throw error;

    return NextResponse.json({
      metadata: {
        source: 'เทศบาลตำบลบ่อหลวง จ.เชียงใหม่',
        license: 'Open Data (Public Domain)',
        total_returned: data.length,
        timestamp: new Date().toISOString()
      },
      data: data
    }, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // อนุญาตให้ทุกคนดึง Open Data ไปใช้ได้
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300' // Cache บน CDN 1 นาที
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch Open Data', details: error.message }, { status: 500 });
  }
}
