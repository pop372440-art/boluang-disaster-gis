import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'นโยบายความเป็นส่วนตัว | Bo Luang Disaster GIS',
  description: 'ประกาศความเป็นส่วนตัวสำหรับระบบ Bo Luang Disaster GIS และบริการรับแจ้งเหตุของเทศบาลตำบลบ่อหลวง',
};

const sections = [
  ['controller', '1. ผู้ควบคุมข้อมูลและช่องทางติดต่อ'],
  ['data', '2. ข้อมูลส่วนบุคคลที่เก็บรวบรวม'],
  ['purpose', '3. วัตถุประสงค์และฐานกฎหมาย'],
  ['ai', '4. การใช้ AI และการตัดสินใจ'],
  ['sharing', '5. ผู้รับข้อมูลและผู้ให้บริการ'],
  ['transfer', '6. การส่งข้อมูลไปต่างประเทศ'],
  ['retention', '7. ระยะเวลาเก็บรักษา'],
  ['rights', '8. สิทธิของเจ้าของข้อมูล'],
  ['security', '9. การรักษาความมั่นคงปลอดภัย'],
  ['cookies', '10. Cookie, Analytics และบันทึกทางเทคนิค'],
  ['complaint', '11. การถอนความยินยอมและร้องเรียน'],
  ['changes', '12. วันที่มีผลและประวัติการแก้ไข'],
] as const;

const dataRows = [
  ['ข้อมูลคำร้อง', 'หมู่บ้าน ประเภทเหตุ ระดับความรุนแรง รายละเอียด และสถานะการดำเนินงาน'],
  ['ข้อมูลผู้แจ้ง', 'ชื่อ–สกุล (ไม่บังคับ) และสถานะผู้แจ้ง เช่น ประชาชน ผู้นำชุมชน หรือเจ้าหน้าที่รัฐ'],
  ['ข้อมูลตำแหน่ง', 'พิกัดละติจูด–ลองจิจูดแบบละเอียด จุดที่เลือกบนแผนที่ และชื่อพื้นที่ที่เกี่ยวข้อง'],
  ['รูปภาพ', 'ภาพเหตุการณ์ ภาพก่อน–หลังดำเนินงาน และข้อมูลที่อาจปรากฏอยู่ในภาพ'],
  ['ข้อมูลบัญชีเจ้าหน้าที่', 'ตัวระบุบัญชี บทบาท สิทธิ์ สถานะ MFA และประวัติการเข้าสู่ระบบเท่าที่จำเป็น'],
  ['ข้อมูลทางเทคนิค', 'วันเวลา IP address หรือค่าที่แฮช/ย่อแล้ว session identifier รหัสติดตามคำร้อง อุปกรณ์ browser และบันทึกความปลอดภัย'],
  ['ข้อมูลการสนทนา/AI', 'ข้อความที่ส่งให้ผู้ช่วย AI รูปภาพที่เลือกวิเคราะห์ และผลวิเคราะห์จากผู้ให้บริการ AI'],
] as const;

const retentionRows = [
  ['คำร้อง พิกัด รูปภาพ และประวัติการดำเนินงาน', 'เก็บจนปิดเรื่องและครบกำหนดตามกฎหมาย ระเบียบงานสารบรรณ บัญชีกำหนดอายุเอกสาร หรือคำสั่งของเทศบาลที่ใช้บังคับ หากมีการตรวจสอบหรือข้อพิพาทอาจเก็บต่อจนกระบวนการสิ้นสุด'],
  ['บัญชีเจ้าหน้าที่และสิทธิ์การเข้าถึง', 'เก็บตลอดเวลาที่ได้รับมอบหมาย ระงับสิทธิ์โดยไม่ชักช้าเมื่อพ้นหน้าที่ และเก็บเฉพาะหลักฐานที่กฎหมายหรือการตรวจสอบกำหนด'],
  ['Audit log และบันทึกความปลอดภัย', 'เก็บตามตารางอายุข้อมูลด้านความมั่นคงปลอดภัยที่เทศบาลอนุมัติ หรือตลอดระยะที่จำเป็นต่อการตรวจสอบและตอบสนองเหตุผิดปกติ'],
  ['สถิติผู้เข้าชมและตัวระบุบนอุปกรณ์', 'เก็บตามรอบการทบทวนสถิติและค่าระยะเวลาในระบบผู้ให้บริการ แล้วลบหรือทำให้ไม่สามารถเชื่อมโยงกลับไปยังบุคคลได้เมื่อหมดความจำเป็น'],
  ['ภาพที่ส่งเพื่อวิเคราะห์ด้วย AI', 'ระบบไม่จัดเก็บสำเนาเพิ่มใน API วิเคราะห์ภาพ หลังตอบคำขอเสร็จ แต่ภาพที่ผู้ใช้ส่งเป็นคำร้องจะเก็บตามระยะเวลาของคำร้อง และผู้ให้บริการภายนอกอาจประมวลผลตามเงื่อนไขของตน'],
] as const;

function PolicySection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-slate-200 pt-8">
      <h2 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-700 md:text-[15px]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-bold text-slate-100 transition hover:border-sky-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              ← กลับหน้าหลัก GIS
            </Link>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
              ฉบับที่ 2.0 · มีผล 1 ตุลาคม 2569
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-8 lg:py-12">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6" aria-label="สารบัญนโยบายความเป็นส่วนตัว">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">สารบัญ</p>
          <nav className="mt-4">
            <ol className="space-y-1.5">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="block rounded-lg px-2.5 py-2 text-xs font-semibold leading-5 text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-sky-950 via-slate-950 to-indigo-950 px-6 py-10 text-white md:px-10 md:py-12">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Privacy Notice · PDPA</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">นโยบายความเป็นส่วนตัว</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">สำหรับระบบ Bo Luang Disaster GIS ระบบรับแจ้งเหตุ ศูนย์สถานการณ์ และบริการดิจิทัลที่เกี่ยวข้องของเทศบาลตำบลบ่อหลวง</p>
          </div>

          <div className="space-y-8 px-6 py-8 md:px-10 md:py-10">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
              <p className="font-black">โปรดอ่านก่อนส่งข้อมูล</p>
              <p className="mt-1">ระบบรับแจ้งเหตุจำเป็นต้องใช้รูปภาพและพิกัดละเอียดเพื่อให้เจ้าหน้าที่ตรวจสอบและเข้าถึงจุดเกิดเหตุได้ถูกต้อง กรุณาหลีกเลี่ยงการถ่ายใบหน้า ทะเบียนรถ เอกสาร หรือข้อมูลของบุคคลอื่นที่ไม่จำเป็น หากเป็นเหตุฉุกเฉินที่คุกคามชีวิต โปรดติดต่อ 191, 1669 หรือสายด่วนสาธารณภัย 1784 ก่อนใช้ระบบนี้</p>
            </div>

            <p className="text-sm leading-7 text-slate-700 md:text-[15px]">เทศบาลตำบลบ่อหลวงเคารพสิทธิความเป็นส่วนตัวและประมวลผลข้อมูลส่วนบุคคลเท่าที่จำเป็น ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 และกฎหมายที่เกี่ยวข้อง นโยบายนี้อธิบายข้อมูลที่ระบบเก็บ เหตุผลที่ใช้ข้อมูล ผู้ที่อาจได้รับข้อมูล ระยะเวลาเก็บ และสิทธิของท่าน</p>

            <PolicySection id="controller" title="1. ผู้ควบคุมข้อมูลและช่องทางติดต่อ">
              <p><strong className="text-slate-950">ผู้ควบคุมข้อมูลส่วนบุคคล:</strong> เทศบาลตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่</p>
              <address className="not-italic rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p>152 หมู่ที่ 12 ตำบลบ่อหลวง อำเภอฮอด จังหวัดเชียงใหม่ 50240</p>
                <p>โทรศัพท์ <a href="tel:052081663" className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">0-5208-1663</a> · งานป้องกันและบรรเทาสาธารณภัย <a href="tel:0871804414" className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">08-7180-4414</a></p>
                <p>อีเมล <a href="mailto:admin@baulaung.go.th" className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">admin@baulaung.go.th</a> · งานสารบรรณ <a href="mailto:saraban@baulaung.go.th" className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">saraban@baulaung.go.th</a></p>
                <p>เวลาทำการ วันจันทร์–ศุกร์ 08.30–16.30 น. ยกเว้นวันหยุดราชการ</p>
              </address>
              <p>เมื่อท่านติดต่อเรื่องข้อมูลส่วนบุคคล โปรดระบุหัวข้อ “คำขอใช้สิทธิตาม PDPA – BL GIS” เพื่อให้หน่วยงานส่งต่อไปยังผู้รับผิดชอบได้รวดเร็ว</p>
            </PolicySection>

            <PolicySection id="data" title="2. ข้อมูลส่วนบุคคลที่เก็บรวบรวม">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[640px] w-full border-collapse text-left text-sm"><thead className="bg-slate-900 text-white"><tr><th className="px-4 py-3 font-bold">กลุ่มข้อมูล</th><th className="px-4 py-3 font-bold">รายการที่อาจเก็บ</th></tr></thead><tbody className="divide-y divide-slate-200">{dataRows.map(([name, detail]) => <tr key={name} className="align-top"><th scope="row" className="w-48 bg-slate-50 px-4 py-3 font-bold text-slate-900">{name}</th><td className="px-4 py-3 text-slate-700">{detail}</td></tr>)}</tbody></table>
              </div>
              <p>ระบบไม่ได้ต้องการข้อมูลอ่อนไหว เช่น เชื้อชาติ ศาสนา สุขภาพ ความพิการ หรือข้อมูลชีวภาพ หากข้อมูลดังกล่าวติดมากับข้อความหรือภาพโดยไม่จำเป็น กรุณาปกปิดก่อนส่ง ผู้แจ้งควรส่งข้อมูลของบุคคลอื่นเฉพาะเมื่อจำเป็นต่อการระงับเหตุหรือช่วยเหลือเท่านั้น</p>
              <p><strong className="text-slate-950">แหล่งที่มาของข้อมูล:</strong> จากข้อมูลที่ท่านกรอกหรืออัปโหลด จากพิกัดที่อุปกรณ์ส่งให้เมื่อท่านอนุญาต จากการบันทึกและอัปเดตของเจ้าหน้าที่หรือหน่วยงานที่ร่วมระงับเหตุ และจากบันทึกทางเทคนิคที่ระบบหรือผู้ให้บริการสร้างขึ้นระหว่างใช้งาน</p>
            </PolicySection>

            <PolicySection id="purpose" title="3. วัตถุประสงค์และฐานกฎหมาย">
              <ul className="list-disc space-y-2 pl-5 marker:text-sky-600">
                <li><strong className="text-slate-950">ภารกิจเพื่อประโยชน์สาธารณะและการใช้อำนาจรัฐ:</strong> รับเรื่อง ตรวจสอบตำแหน่ง ประเมินความเร่งด่วน ประสานเจ้าหน้าที่ ระงับเหตุ และติดตามผล</li>
                <li><strong className="text-slate-950">หน้าที่ตามกฎหมาย:</strong> ดำเนินงานด้านบริการสาธารณะ การป้องกันและบรรเทาสาธารณภัย งานสารบรรณ การตรวจสอบ และการเก็บหลักฐานราชการ</li>
                <li><strong className="text-slate-950">ความยินยอม:</strong> ใช้เฉพาะกิจกรรมเสริมที่ผู้ใช้เลือกได้ เช่น การส่งภาพไปวิเคราะห์ด้วย AI หรือกิจกรรมอื่นที่กฎหมายกำหนดให้ต้องขอความยินยอม โดยการไม่เลือกใช้ AI ไม่กระทบสิทธิในการส่งคำร้อง</li>
                <li><strong className="text-slate-950">ประโยชน์โดยชอบด้วยกฎหมาย:</strong> ป้องกันการใช้งานผิดวัตถุประสงค์ รักษาความมั่นคงปลอดภัย ตรวจสอบเหตุขัดข้อง และจัดทำสถิติแบบลดการระบุตัวบุคคล</li>
                <li><strong className="text-slate-950">ป้องกันหรือระงับอันตรายต่อชีวิต:</strong> ใช้เมื่อจำเป็นเร่งด่วนเพื่อคุ้มครองชีวิต ร่างกาย หรือสุขภาพของบุคคล</li>
              </ul>
              <p>แบบฟอร์มออนไลน์กำหนดให้มีรูปภาพและพิกัดเพื่อให้ตรวจสอบและเข้าถึงจุดเกิดเหตุได้ หากไม่ประสงค์ให้ข้อมูลดังกล่าวผ่านเว็บไซต์ ท่านยังติดต่อเทศบาลทางโทรศัพท์หรือช่องทางราชการอื่นได้โดยไม่ต้องใช้ฟังก์ชัน AI</p>
            </PolicySection>

            <PolicySection id="ai" title="4. การใช้ AI และการตัดสินใจ">
              <p>ระบบจะไม่ส่งภาพไปยัง AI เพียงเพราะท่านเลือกไฟล์ เมื่อท่านกด “วิเคราะห์ภาพด้วย AI (ไม่บังคับ)” เท่านั้น ระบบจึงจะส่งภาพไปยัง <strong className="text-slate-950">Google Gemini</strong> และอาจส่งไปยัง <strong className="text-slate-950">Groq</strong> เมื่อระบบหลักไม่พร้อม เพื่อเสนอประเภทภัย ระดับความรุนแรง และคำบรรยายเบื้องต้น ฟังก์ชันผู้ช่วยสนทนาอาจส่งข้อความที่ท่านพิมพ์ไปยัง Google Gemini เช่นกัน</p>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950"><p className="font-black">AI เป็นเพียงคำแนะนำ</p><p className="mt-1">ผล AI ไม่ใช่คำวินิจฉัย ไม่ใช่ประกาศเตือนภัย และไม่อนุมัติ ปฏิเสธ ปิดเรื่อง หรือสั่งการโดยอัตโนมัติ ผู้ใช้แก้ไขข้อมูลก่อนส่งได้ และเจ้าหน้าที่เป็นผู้ตรวจสอบ/ตัดสินใจขั้นสุดท้าย</p></div>
            </PolicySection>

            <PolicySection id="sharing" title="5. ผู้รับข้อมูลและผู้ให้บริการ">
              <p>เทศบาลไม่ขายข้อมูลส่วนบุคคล ข้อมูลอาจเปิดเผยเท่าที่จำเป็นแก่เจ้าหน้าที่ผู้มีสิทธิ หน่วยงานกู้ชีพ/กู้ภัย ตำรวจ โรงพยาบาล หน่วยงานป้องกันและบรรเทาสาธารณภัย หรือหน่วยงานรัฐที่เกี่ยวข้องกับเหตุ รวมถึงผู้ให้บริการต่อไปนี้:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-sky-600">
                <li><strong className="text-slate-950">Supabase:</strong> ฐานข้อมูล ระบบยืนยันตัวตน และพื้นที่จัดเก็บรูปภาพ</li>
                <li><strong className="text-slate-950">Vercel:</strong> โฮสต์เว็บ แอปพลิเคชัน บันทึกทางเทคนิค และ Web Analytics</li>
                <li><strong className="text-slate-950">Google Gemini และ Groq:</strong> ประมวลผลข้อความหรือภาพเมื่อผู้ใช้เรียกใช้ AI</li>
                <li><strong className="text-slate-950">ผู้ให้บริการแผนที่/ข้อมูลสิ่งแวดล้อม:</strong> เช่น OpenStreetMap, Esri, RainViewer และแหล่งข้อมูลพยากรณ์ ซึ่งอาจได้รับ IP address ข้อมูลอุปกรณ์ และพิกัด/ขอบเขตแผนที่ที่ร้องขอ</li>
              </ul>
              <p><strong className="text-slate-950">QuickChart:</strong> จากการตรวจสอบระบบฉบับนี้ไม่พบการส่งข้อมูลไป QuickChart หากมีการเพิ่มบริการดังกล่าวในอนาคต เทศบาลจะปรับนโยบายและแจ้งวัตถุประสงค์ก่อนใช้งานจริง</p>
              <p>ข้อมูลสาธารณะใน Dashboard/Open Data จะผ่านการลดข้อมูล โดยไม่เผยชื่อผู้แจ้ง ข้อความอิสระ รหัสติดตาม รูปภาพ หรือพิกัดละเอียด</p>
            </PolicySection>

            <PolicySection id="transfer" title="6. การส่งข้อมูลไปต่างประเทศ">
              <p>ผู้ให้บริการ Cloud และ AI บางรายอาจประมวลผลหรือสำรองข้อมูลบนระบบที่อยู่นอกประเทศไทย เทศบาลจะใช้เฉพาะเท่าที่จำเป็น เลือกผู้ให้บริการที่มีมาตรการคุ้มครองเหมาะสม จำกัดสิทธิ์การเข้าถึง และใช้มาตรการตามกฎหมายสำหรับการโอนข้อมูลข้ามพรมแดน หากไม่มีมาตรฐานคุ้มครองที่เพียงพอ จะขอความยินยอมหรืออาศัยข้อยกเว้นที่กฎหมายอนุญาตตามกรณี</p>
            </PolicySection>

            <PolicySection id="retention" title="7. ระยะเวลาเก็บรักษา">
              <p>เทศบาลเก็บข้อมูลเท่าที่จำเป็นต่อวัตถุประสงค์และทบทวนความจำเป็นอย่างสม่ำเสมอ หากไม่สามารถระบุจำนวนปีตายตัวได้ จะใช้เกณฑ์ตามกฎหมาย ระเบียบราชการ ตารางอายุข้อมูล และการตรวจสอบที่เกี่ยวข้อง ดังต่อไปนี้:</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[680px] w-full border-collapse text-left text-sm"><thead className="bg-slate-900 text-white"><tr><th className="px-4 py-3 font-bold">ประเภทข้อมูล</th><th className="px-4 py-3 font-bold">ระยะเวลา/หลักเกณฑ์</th></tr></thead><tbody className="divide-y divide-slate-200">{retentionRows.map(([name, detail]) => <tr key={name} className="align-top"><th scope="row" className="w-64 bg-slate-50 px-4 py-3 font-bold text-slate-900">{name}</th><td className="px-4 py-3 text-slate-700">{detail}</td></tr>)}</tbody></table></div>
            </PolicySection>

            <PolicySection id="rights" title="8. สิทธิของเจ้าของข้อมูล">
              <p>ภายใต้เงื่อนไขของกฎหมาย ท่านอาจขอเข้าถึงและรับสำเนา ขอแก้ไข ขอให้ลบหรือทำลาย ขอจำกัดการใช้ ขอคัดค้าน ขอรับหรือโอนข้อมูลในรูปแบบอิเล็กทรอนิกส์ และขอทราบแหล่งที่มาของข้อมูลที่ไม่ได้เก็บจากท่านโดยตรง รวมถึงถอนความยินยอมได้ทุกเมื่อ</p>
              <p>คำขอบางประเภทอาจถูกจำกัดเมื่อจำเป็นต่อภารกิจสาธารณะ การปฏิบัติตามกฎหมาย การพิสูจน์สิทธิ หรือการคุ้มครองสิทธิของบุคคลอื่น เทศบาลจะแจ้งเหตุผลหากไม่สามารถดำเนินการตามคำขอได้</p>
              <p>เพื่อป้องกันการเปิดเผยแก่บุคคลผิดราย เทศบาลอาจขอข้อมูลเพิ่มเติมเพื่อยืนยันตัวตนและความเชื่อมโยงกับคำร้อง โดยจะใช้ข้อมูลดังกล่าวเพื่อจัดการคำขอเท่านั้น</p>
            </PolicySection>

            <PolicySection id="security" title="9. การรักษาความมั่นคงปลอดภัย">
              <p>ระบบใช้ HTTPS, การจำกัดสิทธิ์ตามบทบาท, การยืนยันตัวตนและ MFA สำหรับเจ้าหน้าที่, Row Level Security, URL รูปภาพแบบมีอายุ, rate limiting, การตรวจสอบชนิด/ขนาดไฟล์, security headers, audit log และการแยก secret ออกจาก browser รวมถึงทบทวนสิทธิ์เมื่อเจ้าหน้าที่เปลี่ยนหน้าที่</p>
              <p>ไม่มีระบบใดปลอดภัยสมบูรณ์ หากสงสัยว่าข้อมูลรั่วไหล โปรดแจ้งเทศบาลทันที เทศบาลจะประเมิน ระงับเหตุ บันทึก และแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลหรือเจ้าของข้อมูลเมื่อเข้าเงื่อนไขตามกฎหมาย</p>
            </PolicySection>

            <PolicySection id="cookies" title="10. Cookie, Analytics และบันทึกทางเทคนิค">
              <p>ระบบใช้ <strong className="text-slate-950">Vercel Web Analytics</strong> เพื่อวัดการใช้งานในภาพรวม ใช้ <strong className="text-slate-950">session storage</strong> สำหรับรหัส session ผู้เข้าชมและ cache ชั่วคราว และใช้ <strong className="text-slate-950">local storage</strong> เพื่อจำรหัสติดตามคำร้องล่าสุดกับเวลาป้องกันการส่งซ้ำบนอุปกรณ์ของท่าน ระบบไม่มี Cookie เพื่อโฆษณาหรือติดตามข้ามเว็บไซต์ในฉบับปัจจุบัน ผู้ให้บริการแผนที่และ Cloud อาจสร้างบันทึกทางเทคนิคที่จำเป็นต่อความปลอดภัยและการส่งมอบบริการ</p>
              <p>ท่านล้าง session storage, local storage หรือข้อมูลเว็บไซต์ได้จากการตั้งค่า browser การล้างข้อมูลอาจทำให้รหัสติดตามที่บันทึกไว้และสถานะชั่วคราวหายไป หากระบบเพิ่ม Cookie ที่ไม่จำเป็นในอนาคต จะมีเครื่องมือขอและถอนความยินยอมก่อนเปิดใช้งาน</p>
            </PolicySection>

            <PolicySection id="complaint" title="11. การถอนความยินยอมและร้องเรียน">
              <p>ท่านไม่จำเป็นต้องใช้ AI และสามารถถอนความยินยอมสำหรับกิจกรรมที่อาศัยความยินยอมได้โดยส่งคำขอไปยังช่องทางในข้อ 1 การถอนจะไม่กระทบความชอบด้วยกฎหมายของการประมวลผลก่อนถอน และข้อมูลที่จำเป็นตามภารกิจสาธารณะหรือหน้าที่ตามกฎหมายอาจยังต้องเก็บต่อไปตามระยะเวลาที่กำหนด การถอนความยินยอมหลัง AI ประมวลผลเสร็จแล้วไม่สามารถย้อนการส่งข้อมูลที่เกิดขึ้นก่อนหน้าได้ แต่ท่านขอให้เทศบาลลบผลหรือข้อมูลที่ยังอยู่ในการควบคุมของเทศบาลได้ตามสิทธิและข้อยกเว้นของกฎหมาย</p>
              <p>หากเห็นว่าเทศบาลจัดการข้อมูลไม่ถูกต้อง โปรดติดต่อเทศบาลเพื่อสอบสวนและแก้ไขก่อน ท่านมีสิทธิร้องเรียนต่อ <a href="https://www.pdpc.or.th/" target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-2">สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)</a> ตามช่องทางที่หน่วยงานกำหนด</p>
            </PolicySection>

            <PolicySection id="changes" title="12. วันที่มีผลและประวัติการแก้ไข">
              <p>นโยบายนี้มีผลตั้งแต่วันที่ <strong className="text-slate-950">1 ตุลาคม 2569</strong> เทศบาลอาจปรับปรุงเมื่อฟังก์ชัน ผู้ให้บริการ กฎหมาย หรือแนวปฏิบัติเปลี่ยนแปลง โดยจะแสดงฉบับและวันที่มีผลไว้บนหน้านี้ หากเป็นการเปลี่ยนแปลงสาระสำคัญจะประกาศให้ทราบผ่านเว็บไซต์หรือช่องทางที่เหมาะสม</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[620px] w-full border-collapse text-left text-sm"><thead className="bg-slate-900 text-white"><tr><th className="px-4 py-3 font-bold">ฉบับ</th><th className="px-4 py-3 font-bold">วันที่มีผล</th><th className="px-4 py-3 font-bold">สาระสำคัญ</th></tr></thead><tbody className="divide-y divide-slate-200"><tr><td className="px-4 py-3 font-bold">2.0</td><td className="px-4 py-3">1 ต.ค. 2569</td><td className="px-4 py-3">เพิ่มรายละเอียด PDPA, AI/Cloud, การโอนข้อมูล, อายุข้อมูล, สิทธิ, ความปลอดภัย และ Analytics</td></tr><tr><td className="px-4 py-3 font-bold">1.0</td><td className="px-4 py-3">ก่อน 1 ต.ค. 2569</td><td className="px-4 py-3">ข้อความแจ้งวัตถุประสงค์ฉบับย่อสำหรับการรับแจ้งเหตุ</td></tr></tbody></table></div>
            </PolicySection>

            <div className="rounded-2xl bg-slate-950 p-6 text-sm leading-7 text-slate-200"><p className="font-black text-white">ช่องทางอ้างอิงของหน่วยงาน</p><p className="mt-1">ตรวจสอบข้อมูลติดต่อและประกาศอย่างเป็นทางการได้ที่ <a href="https://baulaung.go.th/public/list/data/index/menu/1623" target="_blank" rel="noreferrer" className="font-bold text-sky-300 underline underline-offset-2">เว็บไซต์เทศบาลตำบลบ่อหลวง</a> หากข้อความบนหน้านี้ขัดกับประกาศที่เทศบาลลงนามและเผยแพร่อย่างเป็นทางการ ให้ใช้ประกาศทางการเป็นหลัก</p></div>
          </div>
        </article>
      </div>
    </main>
  );
}
