'use client';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import React, { useState, useEffect, useRef } from 'react';

const PHRASES = [
  'สวัสดีครับ! ',
  "ผม 'น้องต้นสน' ",
  'AI ผู้ช่วยของคุณ ',
  'สอบถามข้อมูลได้เลย ',
];

export default function SmartHelper() {
  const pathname = usePathname();
  const isRadarPage = pathname === '/radar';
  const isGisPage = pathname === '/';
  const isMapWorkspace = isRadarPage || isGisPage;
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(isMapWorkspace);
  
  const [messages, setMessages] = useState<{sender: 'user'|'ai', text: string}[]>([
    { sender: 'ai', text: 'สวัสดีครับ! ผมคือ "น้องต้นสน" AI ประจำเทศบาล มีอะไรให้ผมช่วยเหลือหรือสอบถามข้อมูลพื้นที่ได้เลยครับ ' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  //  ระบบ Typewriter Effect (ปรับข้อความให้สั้นกระชับขึ้น)
  // ==========================================
  const [textIndex, setTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isMapWorkspace) setIsMinimized(true);
  }, [isMapWorkspace]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (isOpen || isMinimized) return; // ถ้าเปิดแชท หรือ ซ่อนตัวอยู่ ไม่ต้องเล่นเอฟเฟกต์

    let typingSpeed = isDeleting ? 40 : 80;
    const currentPhrase = PHRASES[textIndex];

    if (!isDeleting && displayText === currentPhrase) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayText === '') {
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % PHRASES.length);
      const timeout = setTimeout(() => {}, 500);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setDisplayText(currentPhrase.substring(0, displayText.length + (isDeleting ? -1 : 1)));
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, textIndex, isOpen, isMinimized]);

  // ==========================================
  //  ฟังก์ชันส่งข้อความ
  // ==========================================
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Chatbot HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setMessages(prev => [...prev, { sender: 'ai', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (pathname === '/fire-smoke') return null;

  return (
    <div className={`bl-ui fixed z-[9999] ${isRadarPage ? 'bottom-4 right-[72px]' : isGisPage ? 'bottom-16 left-4 lg:left-auto lg:right-[430px]' : 'bottom-6 right-6'}`}>
      
      {/* ========================================== */}
      {/* 1. หน้าต่างแชท (Chat Window) */}
      {/* ========================================== */}
      {isOpen && (
        <div className="bg-white w-[min(350px,calc(100vw-2rem))] h-[min(450px,calc(100vh-7rem))] rounded-xl flex flex-col mb-4 border border-gray-100 overflow-hidden transform transition-all duration-300 ease-out translate-y-0 opacity-100">
          <div className="p-4 text-slate-900 font-bold flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="relative flex-shrink-0 bg-white rounded-full p-0.5">
                <Image src="/mascot.png" width={24} height={24} alt="น้องต้นสน" className="h-6 w-6 object-contain rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="leading-tight text-base">ผู้ช่วยบ่อหลวง (AI)</span>
                <span className="text-sm text-blue-700 font-normal mt-0.5 flex items-center">
                  
                  ข้อมูลจาก AI ควรตรวจสอบกับแหล่งอ้างอิง
                </span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} aria-label="ปิดผู้ช่วย AI" className="hover:text-blue-700 hover:rotate-90 transition-transform duration-200 text-2xl leading-none -mt-1">&times;</button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'ai' && (
                  <div className="w-6 h-6 rounded-full mr-2 self-end mb-1 opacity-80 bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Image src="/mascot.png" width={20} height={20} alt="" className="h-5 w-5 object-contain" />
                  </div>
                )}
                <div className={`max-w-[75%] p-3 rounded-xl text-base leading-relaxed  ${msg.sender === 'user' ? 'bg-blue-50 text-slate-900 rounded-br-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-bl-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-end">
                 <div className="w-6 h-6 rounded-full mr-2 opacity-80 bg-blue-100 flex items-center justify-center animate-bounce">
                    <Image src="/mascot.png" width={20} height={20} alt="" className="h-5 w-5 object-contain" />
                 </div>
                 <div className="bg-white border border-gray-100 p-3 rounded-xl rounded-bl-sm flex space-x-1.5 items-center h-[38px]">
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-100 flex space-x-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isLoading ? "น้องต้นสนกำลังคิด..." : "พิมพ์สอบถามที่นี่..."} className="flex-1 px-4 py-2.5 bg-gray-100 border-transparent rounded-full text-base outline-none focus:bg-white focus:border-blue-200 focus:ring-2 focus:ring-blue-200 transition-all text-gray-800 disabled:opacity-50" disabled={isLoading} />
            <button type="submit" disabled={isLoading || !input.trim()} className="bg-blue-50 text-slate-900 px-5 py-2.5 rounded-full font-bold hover:bg-blue-50 transition-all disabled:bg-gray-300 disabled:hover:translate-y-0 disabled:shadow-none">ส่ง</button>
          </form>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. โหมดแสดงเต็ม (Mascot + Typing Bubble) */}
      {/* ========================================== */}
      <div className="relative flex justify-end items-end">
        {!isOpen && !isMinimized && (
          <>
            {/*  บอลลูนทักทาย (ปรับขนาด w-[150px] ให้เล็กลงและกระชับพอดีคำ) */}
            <div className="hidden absolute bottom-[65px] right-2 bg-white text-blue-700 text-sm font-bold px-2 rounded-xl border border-blue-100 w-[150px] h-[40px] flex items-center justify-center text-center transition-all">
              
              {/*  ปุ่มปิด (ซ่อน AI ให้กลายเป็นปุ่มเล็ก) */}
              <button 
                onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                className="absolute -top-2 -right-2 bg-white hover:bg-red-500 text-gray-600 hover:text-slate-900 rounded-full w-5 h-5 flex items-center justify-center text-sm border border-gray-200 transition-colors z-50"
                title="ซ่อนผู้ช่วย"
              >
                
              </button>

              <span className="cursor-pointer w-full whitespace-nowrap" onClick={() => setIsOpen(true)}>
                {displayText}
                <span className="animate-pulse text-blue-700 font-normal">|</span>
              </span>
              
              {/* สามเหลี่ยมชี้ลงมาที่มาสคอต */}
              <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white transform rotate-45 border-r border-b border-blue-100"></div>
            </div>

            {/*  ตัวมาสคอต */}
            <button 
              onClick={() => setIsOpen(true)} 
              aria-label="เปิดผู้ช่วย AI น้องต้นสน"
              className="relative w-12 h-12 flex items-center justify-center z-50 bg-white border border-slate-200 rounded-full"
            >
              <Image src="/mascot.png" width={40} height={40} alt="" className="h-10 w-10 object-contain rounded-full" />
            </button>
          </>
        )}
        {/* ========================================== */}
        {/* 3. โหมดซ่อนตัว (Tiny Minimized Icon) */}
        {/* ========================================== */}
        {!isOpen && isMinimized && (
          <button 
            onClick={() => setIsOpen(true)} // พอกดก็จะเปิดแชทเลย
            aria-label="เปิดผู้ช่วย AI น้องต้นสน"
            className="relative w-12 h-12 bg-white rounded-full flex items-center justify-center transition-all duration-300 z-50 border border-blue-100 group"
            title="เรียกใช้งานน้องต้นสน"
          >
            <Image src="/mascot.png" width={40} height={40} alt="" className="h-10 w-10 object-contain rounded-full" />
            
          </button>
        )}

      </div>
    </div>
  );
}
