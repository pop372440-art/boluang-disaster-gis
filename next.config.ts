/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. ส่วนของ rewrites (ของเดิมที่มีอยู่แล้ว)
  async rewrites() {
    return [
      {
        source: '/api/onwr/:path*',
        destination: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/:path*',
      },
    ];
  },

  // 2. ส่วนของ headers (เพิ่มใหม่เพื่อแก้ CORS)
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

export default nextConfig;
