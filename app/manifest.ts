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
        src: '/apple-icon.png',
        sizes: '1254x1254',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
    // 🌟 เพิ่ม Screenshots ปลดล็อค Richer UI ใน Android
    screenshots: [
      {
        src: '/screen-wide.png',
        sizes: '1280x720', // ใส่ขนาดคร่าวๆ ของจอคอมแนวนอน
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screen-mobile.png',
        sizes: '750x1334', // ใส่ขนาดคร่าวๆ ของจอมือถือแนวตั้ง
        type: 'image/png',
      },
    ],
  }
}
