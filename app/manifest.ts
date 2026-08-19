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
        src: '/android-chrome-192x192.png', // ชี้ไปที่ไฟล์รูปขนาด 192 ของจริง
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png', // ชี้ไปที่ไฟล์รูปขนาด 512 ของจริง
        sizes: '512x512',
        type: 'image/png',
      }
    ],
    screenshots: [
      {
        src: '/screen-wide.png', // ต้องอัปโหลดไฟล์นี้ไว้ใน public/
        sizes: '1904×1080', // ขนาดโดยประมาณของแนวนอน
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screen-mobile.png', // ต้องอัปโหลดไฟล์นี้ไว้ใน public/
        sizes: '750x1334', // ขนาดโดยประมาณของแนวตั้ง
        type: 'image/png',
      },
    ],
  }
}
