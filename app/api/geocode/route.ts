import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  
  // 🌟 กำหนด User-Agent เพื่อป้องกันโดน OpenStreetMap (Nominatim) บล็อก
  const headers = {
    'User-Agent': 'BoLuangDisasterGIS/1.0 (Contact: admin@boluang.go.th)',
    'Accept-Language': 'th-TH, th;q=0.9, en;q=0.8',
  };

  try {
    // ==========================================
    // 📍 1. โหมด Reverse (แปลง ละติจูด/ลองจิจูด -> เป็นชื่อสถานที่)
    // ==========================================
    if (mode === 'reverse') {
      const lat = searchParams.get('lat');
      const lng = searchParams.get('lng');

      if (!lat || !lng) {
        return NextResponse.json({ ok: false, error: 'Missing lat or lng' }, { status: 400 });
      }

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=th`;
      const res = await fetch(url, { headers });
      
      if (!res.ok) throw new Error('Failed to fetch from Nominatim');
      
      const data = await res.json();
      
      if (data && data.display_name) {
        // จัดฟอร์แมตชื่อให้สวยงาม (เอาแค่ 3 ส่วน ท้ายสุดมาเรียงใหม่ คั่นด้วย •)
        const parts = data.display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
        return NextResponse.json({ ok: true, name: parts || data.display_name });
      }

      return NextResponse.json({ ok: false, error: 'Location not found' }, { status: 404 });
    }

    // ==========================================
    // 🔍 2. โหมด Search (ค้นหาจากคำค้น -> เป็น ละติจูด/ลองจิจูด)
    // ==========================================
    if (mode === 'search') {
      const q = searchParams.get('q');
      const limit = searchParams.get('limit') || '5';

      if (!q) {
        return NextResponse.json({ ok: false, error: 'Missing search query' }, { status: 400 });
      }

      // บังคับค้นหาในประเทศไทยเพื่อความแม่นยำ (ถ้าต้องการ) โดยเติม " ประเทศไทย"
      const searchQuery = encodeURIComponent(q.trim());
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=${limit}&accept-language=th&countrycodes=th`;
      
      const res = await fetch(url, { headers });
      
      if (!res.ok) throw new Error('Failed to fetch from Nominatim');
      
      const data = await res.json();

      if (data && data.length > 0) {
        // Map ข้อมูลกลับไปให้ตรงกับที่หน้าบ้าน (Frontend) ต้องการ
        const results = data.map((item: any) => {
          const parts = item.display_name.split(',').slice(0, 3).reverse().map((s: string) => s.trim()).join(' • ');
          return {
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            name: parts || item.display_name,
            displayName: item.display_name
          };
        });

        return NextResponse.json({ ok: true, results });
      }

      return NextResponse.json({ ok: false, error: 'ไม่พบสถานที่นี้ในฐานข้อมูล', results: [] }, { status: 404 });
    }

    // ถ้าไม่ได้ระบุ Mode
    return NextResponse.json({ ok: false, error: 'Invalid mode. Use ?mode=reverse or ?mode=search' }, { status: 400 });

  } catch (error: any) {
    console.error('Geocode API Error:', error.message);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
