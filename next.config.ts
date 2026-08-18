import withPWAInit from "@ducanh2912/next-pwa";

// 🌟 ตั้งค่า PWA
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", 
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. ส่วนของ rewrites (ของเดิมที่มีอยู่แล้ว ห้ามลบ)
  async rewrites() {
    return [
      {
        source: '/api/onwr/:path*',
        destination: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/:path*',
      },
    ];
  },

  // 2. ส่วนของ headers (เพิ่มใหม่เพื่อแก้ CORS ของเดิม ห้ามลบ)
  async headers() {
    return [
      {
        // ใช้กับทุกเส้นทาง (Route) ในเว็บของคุณ
        source: '/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

// 🌟 นำตั้งค่า PWA มาครอบ nextConfig เดิม แล้ว Export ออกไป
export default withPWA(nextConfig);
