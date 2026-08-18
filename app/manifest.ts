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
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
