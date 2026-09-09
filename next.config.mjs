/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 1. นำไปใช้กับทุก Path ในเว็บไซต์
        source: '/(.*)',
        headers: [
          // ป้องกัน Clickjacking (ไม่ให้เว็บอื่นดูดหน้าเว็บเราไปฝังใน iframe)
          { key: 'X-Frame-Options', value: 'DENY' },
          // ป้องกันเบราว์เซอร์เดาประเภทไฟล์ผิด
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Content-Security-Policy (CSP) ป้องกัน XSS และการแอบฝัง Script อันตราย
          // *อนุญาตให้โหลดข้อมูล/รูปภาพเฉพาะจากโดเมนที่ปลอดภัย (https) เท่านั้น
          { 
            key: 'Content-Security-Policy', 
            // 🚀 เพิ่ม frame-src ต่อท้ายสุด เพื่อปลดล็อก iframe ของ Windy และ Google Maps
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:; frame-src 'self' https://embed.windy.com https://www.windy.com https://www.google.com;" 
          }
        ],
      },
      {
        // 2. ล็อก CORS สำหรับ API ฝั่ง Backend ของเราเท่านั้น
        source: '/api/:path*',
        headers: [
          // เปลี่ยนจาก * เป็นชื่อโดเมนจริงของเทศบาล ป้องกันคนอื่นขโมยยิง API
          { key: 'Access-Control-Allow-Origin', value: 'https://boluang-disaster-gis.vercel.app' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      }
    ];
  },
};

export default nextConfig;
