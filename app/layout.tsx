import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 🚨 1. Import ผู้ช่วยบ่อหลวงเข้ามาใช้งาน
import SmartHelper from '@/components/SmartHelper';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Bo Luang GIS | ระบบจัดการสาธารณภัย',
  description: 'ระบบสารสนเทศทางภูมิศาสตร์เพื่อการบริหารจัดการสาธารณภัย ตำบลบ่อหลวง',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        
        {/* เนื้อหาหลักของเว็บ */}
        {children}

        {/* 🚨 2. วางแชทบอทไว้ก่อนปิด Body (ตัวบอทจะลอยอยู่มุมขวาล่างเสมอ) */}
        <SmartHelper />
        
      </body>
    </html>
  );
}
