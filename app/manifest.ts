import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bo Luang GIS | ระบบจัดการสาธารณภัย',
    short_name: 'BL GIS',
    description: 'ระบบสารสนเทศภูมิศาสตร์ ต.บ่อหลวง',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b132b',
    theme_color: '#0b132b',
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
