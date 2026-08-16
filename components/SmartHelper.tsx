'use client';
import React, { useState } from 'react';

export default function SmartHelper() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{sender: 'user'|'ai', text: string}[]>([
    { sender: 'ai', text: 'สวัสดีครับ! ผมคือ "ผู้ช่วยบ่อหลวง" AI ประจำเทศบาล มีอะไรให้ผมช่วยเหลือหรือสอบถามข้อมูลพื้นที่ได้เลยครับ 🤖' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="fixed bottom-6 right-6 z-[999]">
      {/* หน้าต่างแชท */}
      {isOpen && (
        <div className="bg-blue-600 p-4 text-white font-bold flex justify-between items-center shadow-md">
  <div className="flex items-center space-x-3">
    <img src="/mascot.jpg" alt="น้องบ่อหลวง" className="w-10 h-10 object-cover rounded-full border-2 border-white shadow-sm" />
    <div className="flex flex-col">
      <span className="leading-tight">ผู้ช่วยบ่อหลวง (AI)</span>
      <span className="text-[10px] text-blue-200 font-normal">พร้อมให้บริการ 24 ชม.</span>
    </div>
  </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-gray-300">✖</button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-gray-400 text-xs animate-pulse">ผู้ช่วยบ่อหลวงกำลังพิมพ์...</div>}
          </div>

          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-gray-200 flex space-x-2">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="พิมพ์สอบถามที่นี่..." className="flex-1 px-4 py-2 border rounded-full text-sm outline-none focus:border-blue-500 text-gray-800" disabled={isLoading}/>
            <button type="submit" disabled={isLoading} className="bg-blue-600 text-white px-4 py-2 rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-400">ส่ง</button>
          </form>
        </div>
      )}

      {/* ปุ่มเปิดแชท */}
<button onClick={() => setIsOpen(!isOpen)} className="w-16 h-16 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform border-4 border-white overflow-hidden bg-white z-50">
  <img src="/mascot.jpg" alt="เปิดแชท" className="w-full h-full object-cover" />
</button>
    </div>
  );
}
