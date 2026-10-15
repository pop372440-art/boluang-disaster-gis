import LineIcon from './LineIcon';

export default function ExternalFloodLink() {
  return <a className="bl-external-link" href="https://flood.nonarkara.org/BoLuang?city=%E0%B8%9A%E0%B9%88%E0%B8%AD%E0%B8%AB%E0%B8%A5%E0%B8%A7%E0%B8%87&tv=1" target="_blank" rel="noopener noreferrer">
    <span><strong>FloodDash</strong><span className="block text-sm text-slate-600">ข้อมูลน้ำท่วมภายนอก · เปิดแท็บใหม่</span><span className="mt-1 block text-sm text-slate-500">ระบบอิสระ ไม่ใช่ประกาศเตือนของเทศบาล</span></span>
    <LineIcon name="external" className="h-4 w-4 shrink-0" />
  </a>;
}
