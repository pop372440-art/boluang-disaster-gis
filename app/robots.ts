import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/'], // ซ่อนหน้า API และหน้า Admin จาก Google
    },
    sitemap: 'https://boluang-disaster-gis.vercel.app/sitemap.xml',
  }
}
