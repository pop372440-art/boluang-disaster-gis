'use client';
import React, { useState, useEffect } from 'react';

export default function SmartHelper() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{sender: 'user'|'ai', text: string}[]>([
    { sender: 'ai', text: 'สวัสดีครับ! ผมคือ "น้องต้นสน" AI ประจำเทศบาล มีอะไรให้ผมช่วยเหลือหรือสอบถามข้อมูลพื้นที่ได้เลยครับ 🤖' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ==========================================
  // 🌟 ระบบ Typewriter Effect (พิมพ์ทีละประโยค)
  // ==========================================
  const [textIndex, setTextIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const phrases = [
    "สวัสดีครับ! 👋",
    "ผมคือ 'น้องต้นสน' 🌲",
    "AI ประจำเทศบาล 🤖",
    "มีอะไรให้ผมช่วยเหลือ...",
    "สอบถามข้อมูลพื้นที่ได้เลยครับ ✨"
  ];

  useEffect(() => {
    if (isOpen) return; // ถ้าเปิดแชทอยู่ ไม่ต้องเล่นเอฟเฟกต์

    let typingSpeed = isDeleting ? 40 : 80; // ความเร็วตอนพิมพ์ กับ ตอนลบ
    const currentPhrase = phrases[textIndex];

    if (!isDeleting && displayText === currentPhrase) {
      // พิมพ์ประโยคจบแล้ว ให้หยุดรอ 2 วินาที ก่อนเริ่มลบ
      const timeout = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timeout);
    }

    if (isDeleting && displayText === '') {
      // ลบข้อความหมดแล้ว ให้เปลี่ยนไปประโยคถัดไป
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % phrases.length);
      const timeout = setTimeout(() => {}, 500); // รอแป๊บนึงก่อนเริ่มพิมพ์ใหม่
      return () => clearTimeout(timeout);
    }

    // กลไกการพิมพ์/ลบ ทีละตัวอักษร
    const timeout = setTimeout(() => {
      setDisplayText(currentPhrase.substring(0, displayText.length + (isDeleting ? -1 : 1)));
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, textIndex, isOpen]);

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
      {/* หน้าต่างแชท */}
      {isOpen && (
        <div className="bg-white w-[350px] h-[450px] rounded-3xl shadow-2xl flex flex-col mb-4 border border-gray-100 overflow-hidden transform transition-all duration-300 ease-out translate-y-0 opacity-100">
          
          {/* 📍 หัวแชท + โลโก้มาสคอต */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 text-white font-bold flex justify-between items-center shadow-md">
            <div className="flex items-center space-x-3">
              <div className="relative flex-shrink-0 bg-white rounded-full p-0.5">
                <img 
                  src="/mascot.png" 
                  alt="น้องต้นสน" 
                  className={`w-10 h-10 object-contain rounded-full transition-all duration-300 ${isLoading ? 'animate-pulse scale-110 shadow-blue-300' : ''}`} 
                />
              </div>
              <div className="flex flex-col">
                <span className="leading-tight text-[15px]">ผู้ช่วยบ่อหลวง (AI)</span>
                <span className="text-[11px] text-blue-100 font-normal mt-0.5 flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse"></span>
                  พร้อมให้บริการ 24 ชม.
                </span>
              </div>
            </div>
            {/* ปุ่มปิดแชท */}
            <button onClick={() => setIsOpen(false)} className="hover:text-blue-200 hover:rotate-90 transition-transform duration-200 text-2xl leading-none -mt-1">&times;</button>
          </div>
          
          {/* พื้นที่ข้อความ */}
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
            {/* สถานะกำลังพิมพ์ */}
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

          {/* ช่องพิมพ์ข้อความ */}
          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-100 flex space-x-2">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder={isLoading ? "น้องต้นสนกำลังคิด..." : "พิมพ์สอบถามที่นี่..."} 
              className="flex-1 px-4 py-2.5 bg-gray-100 border-transparent rounded-full text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-gray-800 disabled:opacity-50" 
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={isLoading || !input.trim()} 
              className="bg-blue-600 text-white px-5 py-2.5 rounded-full font-bold hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:bg-gray-300 disabled:hover:translate-y-0 disabled:shadow-none"
            >
              ส่ง
            </button>
          </form>
        </div>
      )}

      {/* 📍 กลุ่มปุ่มเปิดแชทรูปมาสคอต (ด้านล่างขวา) */}
      <div className="relative flex justify-end items-end">
        
        {/* 🌟 บอลลูนทักทาย (Typewriter Effect) */}
        {!isOpen && (
          <div 
            className="absolute bottom-[75px] right-2 bg-white text-blue-700 text-[13px] font-bold px-4 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.25)] border border-blue-100 cursor-pointer w-[250px] h-[50px] flex items-center justify-center text-center transition-all hover:scale-105" 
            onClick={() => setIsOpen(true)}
            title="คลิกเพื่อคุยกับน้องต้นสน"
          >
            {/* ขัอความกำลังพิมพ์ พร้อมขีดกะพริบ | */}
            <span>
              {displayText}
              <span className="animate-pulse text-blue-400 font-normal">|</span>
            </span>

            {/* สามเหลี่ยมชี้ลงมาที่มาสคอต */}
            <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white transform rotate-45 border-r border-b border-blue-100"></div>
          </div>
        )}

        {/* 🌟 ปุ่มมาสคอตแบบโปร่งใส (ลบพื้นหลังขาวออกแล้ว) */}
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className="relative w-20 h-20 flex items-center justify-center hover:scale-110 transition-transform duration-300 z-50 group bg-transparent focus:outline-none"
        >
          <img 
            src="/mascot.png" 
            alt="เปิดแชท" 
            /* ใส่ Drop Shadow สะท้อนตามเงารูปทรงของมาสคอต */
            className={`w-full h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] transition-transform duration-500 ${isOpen ? 'scale-110' : 'group-hover:rotate-6 group-hover:scale-110'}`} 
          />
        </button>

        {/* 🟢 จุดเขียวแสดงสถานะ Online (ปรับให้แนบตัวมาสคอต) */}
        {!isOpen && (
          <span className="absolute bottom-2 right-2 flex h-4 w-4 z-50">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white shadow-sm"></span>
          </span>
        )}
      </div>
    </div>
  );
}
