'use client';
import React, { useState, useEffect } from 'react';

export default function SmartHelper() {
  const [isOpen, setIsOpen] = useState(false);
  // 🌟 State ใหม่สำหรับโหมด "ซ่อนตัว (Minimize)"
  const [isMinimized, setIsMinimized] = useState(false);
  
  const [messages, setMessages] = useState<{sender: 'user'|'ai', text: string}[]>([
    { sender: 'ai', text: 'สวัสดีครับ! ผมคือ "น้องต้นสน" AI ประจำเทศบาล มีอะไรให้ผมช่วยเหลือหรือสอบถามข้อมูลพื้นที่ได้เลยครับ 🤖' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  // 🌟 ระบบ Typewriter Effect (ปรับข้อความให้สั้นกระชับขึ้น)
  // ==========================================
  const [textIndex, setTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const phrases = [
    "สวัสดีครับ! 👋",
    "ผม 'น้องต้นสน' 🌲",
    "AI ผู้ช่วยของคุณ 🤖",
    "สอบถามข้อมูลได้เลย ✨"
  ];

  useEffect(() => {
    if (isOpen || isMinimized) return; // ถ้าเปิดแชท หรือ ซ่อนตัวอยู่ ไม่ต้องเล่นเอฟเฟกต์

    let typingSpeed = isDeleting ? 40 : 80;
    const currentPhrase = phrases[textIndex];

    if (!isDeleting && displayText === currentPhrase) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayText === '') {
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % phrases.length);
      const timeout = setTimeout(() => {}, 500);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setDisplayText(currentPhrase.substring(0, displayText.length + (isDeleting ? -1 : 1)));
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, textIndex, isOpen, isMinimized]);

  // ==========================================
  // 💬 ฟังก์ชันส่งข้อความ
  // ==========================================
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อครับ' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      
      {/* ========================================== */}
      {/* 1. หน้าต่างแชท (Chat Window) */}
      {/* ========================================== */}
      {isOpen && (
        <div className="bg-white w-[350px] h-[450px] rounded-3xl shadow-2xl flex flex-col mb-4 border border-gray-100 overflow-hidden transform transition-all duration-300 ease-out translate-y-0 opacity-100">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 text-white font-bold flex justify-between items-center shadow-md">
            <div className="flex items-center space-x-3">
              <div className="relative flex-shrink-0 bg-white rounded-full p-0.5">
                <img src="/mascot.png" alt="น้องต้นสน" className={`w-10 h-10 object-contain rounded-full transition-all duration-300 ${isLoading ? 'animate-pulse scale-110 shadow-blue-300' : ''}`} />
              </div>
              <div className="flex flex-col">
                <span className="leading-tight text-[15px]">ผู้ช่วยบ่อหลวง (AI)</span>
                <span className="text-[11px] text-blue-100 font-normal mt-0.5 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse"></span>
                  พร้อมให้บริการ 24 ชม.
                </span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-blue-200 hover:rotate-90 transition-transform duration-200 text-2xl leading-none -mt-1">&times;</button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'ai' && (
                  <div className="w-6 h-6 rounded-full mr-2 self-end mb-1 opacity-80 bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <img src="/mascot.png" alt="AI" className="w-5 h-5 object-contain" />
                  </div>
                )}
                <div className={`max-w-[75%] p-3 rounded-2xl text-[14px] leading-relaxed shadow-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-bl-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-end">
                 <div className="w-6 h-6 rounded-full mr-2 opacity-80 bg-blue-100 flex items-center justify-center animate-bounce">
                    <img src="/mascot.png" alt="AI" className="w-5 h-5 object-contain" />
                 </div>
                 <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-sm shadow-sm flex space-x-1.5 items-center h-[38px]">
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-100 flex space-x-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isLoading ? "น้องต้นสนกำลังคิด..." : "พิมพ์สอบถามที่นี่..."} className="flex-1 px-4 py-2.5 bg-gray-100 border-transparent rounded-full text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-gray-800 disabled:opacity-50" disabled={isLoading} />
            <button type="submit" disabled={isLoading || !input.trim()} className="bg-blue-600 text-white px-5 py-2.5 rounded-full font-bold hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:bg-gray-300 disabled:hover:translate-y-0 disabled:shadow-none">ส่ง</button>
          </form>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. โหมดแสดงเต็ม (Mascot + Typing Bubble) */}
      {/* ========================================== */}
      <div className="relative flex justify-end items-end">
        {!isOpen && !isMinimized && (
          <>
            {/* 🌟 บอลลูนทักทาย */}
            <div className="absolute bottom-[65px] right-2 bg-white text-blue-700 text-[12px] font-bold px-4 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.25)] border border-blue-100 w-[200px] h-[45px] flex items-center justify-center text-center transition-all hover:scale-105">
              
              {/* 🔴 ปุ่มปิด (ซ่อน AI ให้กลายเป็นปุ่มเล็ก) */}
              <button 
                onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                className="absolute -top-2 -right-2 bg-white hover:bg-red-500 text-gray-400 hover:text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md border border-gray-200 transition-colors z-50"
                title="ซ่อนผู้ช่วย"
              >
                ✖
              </button>

              <span className="cursor-pointer w-full" onClick={() => setIsOpen(true)}>
                {displayText}
                <span className="animate-pulse text-blue-400 font-normal">|</span>
              </span>
              
              {/* สามเหลี่ยมชี้ลงมาที่มาสคอต */}
              <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white transform rotate-45 border-r border-b border-blue-100"></div>
            </div>

            {/* 🌟 ตัวมาสคอต (ปรับขนาดลงเหลือ w-16 h-16) */}
            <button 
              onClick={() => setIsOpen(true)} 
              className="relative w-16 h-16 flex items-center justify-center hover:scale-110 transition-transform duration-300 z-50 group bg-transparent focus:outline-none"
            >
              <img src="/mascot.png" alt="เปิดแชท" className="w-full h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] transition-transform duration-500 group-hover:rotate-6" />
            </button>
          </>
        )}

        {/* ========================================== */}
        {/* 3. โหมดซ่อนตัว (Tiny Minimized Icon) */}
        {/* ========================================== */}
        {!isOpen && isMinimized && (
          <button 
            onClick={() => setIsOpen(true)} // พอกดก็จะเปิดแชทเลย
            className="relative w-12 h-12 bg-white rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.3)] flex items-center justify-center hover:scale-110 transition-all duration-300 z-50 border border-blue-100 group"
            title="เรียกใช้งานน้องต้นสน"
          >
            <img src="/mascot.png" alt="AI" className="w-8 h-8 object-contain transition-transform group-hover:scale-110" />
            <span className="absolute top-0 right-0 flex h-3 w-3 z-50">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white"></span>
            </span>
          </button>
        )}

        {/* 🟢 จุดเขียว (แสดงเฉพาะตอนโหมดแสดงเต็ม ไม่ซ่อนตัว) */}
        {!isOpen && !isMinimized && (
          <span className="absolute bottom-1 right-1 flex h-3 w-3 z-50">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white shadow-sm"></span>
          </span>
        )}
      </div>
    </div>
  );
}
