/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/onwr/:path*',
        destination: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/:path*',
      },
    ];
  },
};

export default nextConfig;
