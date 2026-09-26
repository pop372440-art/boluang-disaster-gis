import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bo Luang Environmental Intelligence & Early Warning',
    short_name: 'BL Intelligence',
    description: 'ระบบติดตาม พยากรณ์ และสนับสนุนการตัดสินใจด้านอากาศ สิ่งแวดล้อม และภัยพิบัติ เทศบาลตำบลบ่อหลวง',
    start_url: '/intelligence',
    display: 'standalone',
    background_color: '#0b132b',
    theme_color: '#38bdf8',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: '/screen-wide.png',
        sizes: '1280x720',
        type: 'image/png',
      },
      {
        src: '/screen-mobile.png',
        sizes: '750x1334',
        type: 'image/png',
      },
    ],
  }
}
