import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 🚨 1. Import ผู้ช่วยบ่อหลวงเข้ามาใช้งาน
import SmartHelper from '@/components/SmartHelper';

// 📈 2. Import Vercel Analytics (เก็บสถิติผู้ใช้งาน)
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 🌟 ตั้งค่า SEO และ Social Sharing (OG Image) + เก็บค่า PWA เดิมไว้
export const metadata: Metadata = {
  title: 'ระบบบริหารจัดการสาธารณภัย เทศบาลตำบลบ่อหลวง (Bo Luang Disaster GIS)',
  description: 'แพลตฟอร์มแจ้งเหตุและเฝ้าระวังภัยพิบัติ (ไฟป่า, น้ำท่วม, ฝุ่น PM2.5) ตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่ ขับเคลื่อนเมืองน่าอยู่อัจฉริยะ Smart City',
  keywords: ['บ่อหลวง', 'แจ้งเหตุ', 'ไฟป่า', 'น้ำท่วม', 'PM2.5', 'Smart City', 'เชียงใหม่', 'GIS'],
  appleWebApp: { title: 'BL GIS', statusBarStyle: 'black-translucent' },
  icons: { apple: '/android-chrome-192x192.png' },
  openGraph: {
    title: 'Bo Luang Disaster GIS - ระบบแจ้งเหตุสาธารณภัย',
    description: 'ระบบเฝ้าระวังและรับแจ้งเหตุสาธารณภัย เทศบาลตำบลบ่อหลวง จ.เชียงใหม่',
    url: 'https://boluang-disaster-gis.vercel.app',
    siteName: 'Bo Luang Disaster GIS',
    images: [
      {
        url: '/og-image.jpg', // อย่าลืมเอารูปไปใส่ในโฟลเดอร์ public นะครับ
        width: 1200,
        height: 630,
        alt: 'Bo Luang Disaster GIS Preview',
      },
    ],
    locale: 'th_TH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bo Luang Disaster GIS',
    description: 'ระบบเฝ้าระวังและรับแจ้งเหตุสาธารณภัย เทศบาลตำบลบ่อหลวง จ.เชียงใหม่',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* 🚀 เปิดท่อเชื่อมต่อล่วงหน้าสำหรับโหลดแผนที่ OSM และ Esri เพื่อลด LCP ลงให้ผ่านเกณฑ์ */}
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://server.arcgisonline.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        
        {/* เนื้อหาหลักของเว็บ */}
        {children}
        
        {/* 🚨 วางแชทบอทไว้ก่อนปิด Body (ตัวบอทจะลอยอยู่มุมขวาล่างเสมอ) */}
        <SmartHelper />
        
        {/* 📈 วาง Component Analytics ไว้ท้ายสุดเพื่อเก็บสถิติ */}
        <Analytics />
        
      </body>
    </html>
  );
}
