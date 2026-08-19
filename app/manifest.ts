import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ระบบภูมิสารสนเทศ เทศบาลตำบลบ่อหลวง',
    short_name: 'BL GIS',
    description: 'ระบบสารสนเทศทางภูมิศาสตร์เพื่อบริหารจัดการด้านสาธารณภัย เทศบาลตำบลบ่อหลวง',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b132b',
    theme_color: '#38bdf8',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    screenshots: [
      {
        src: '/screen-wide.png',
        sizes: '1280x720', // ⚠️ ถ้าขนาดของจริงไม่ใช่ 1280x720 ต้องเปลี่ยนตรงนี้นะครับ
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screen-mobile.png',
        sizes: '750x1334', // ตามขนาดจริงที่ท่านเคยบอกไว้
        type: 'image/png',
      },
    ],
  }
}
