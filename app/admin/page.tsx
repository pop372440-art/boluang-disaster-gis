'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient, type Session } from '@supabase/supabase-js';
import Swal from 'sweetalert2';
import type { StaffRole } from '@/lib/staff/security';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type StaffSession = { id: string; email: string | null; role: StaffRole; currentAal: string; mfaRequired: true; idleTimeoutMinutes: number };
type StaffAction = { id: string; action_kind: string; details: string; actor_role: StaffRole; created_at: string; imageUrls: Array<string | null> };
type StaffReport = {
  id: string; created_at: string; reporter_name: string | null; reporter_role: string | null;
  risk_type: string; severity_level: number | null; description: string | null;
  latitude: number; longitude: number; village_name: string | null; status: string | null;
  workflow_state: string; resolved_at: string | null; action_taken: string | null;
  resolved_by: string | null; closure_requested_at: string | null;
  approved_at: string | null; approval_note: string | null; beforeImageUrl: string | null;
  resultImageUrl: string | null; resultImageUrl2: string | null; actions: StaffAction[];
};
type AuditEvent = { id: number; report_id: string | null; actor_role: StaffRole | null; action: string; ip_hash: string | null; session_hash: string | null; created_at: string };
type StaffUser = { user_id: string; role: StaffRole; active: boolean; display_name: string | null; email: string | null };
type PortalTab = 'active' | 'pending_approval' | 'closed' | 'audit' | 'users';

const ROLE_LABELS: Record<StaffRole, string> = { viewer: 'ผู้ดูข้อมูล', operator: 'เจ้าหน้าที่ปฏิบัติ', approver: 'ผู้อนุมัติ', admin: 'ผู้ดูแลระบบ' };
const ACTION_LABELS: Record<string, string> = {
  closure_requested: 'ส่งขออนุมัติปิดเหตุ', closure_approved: 'อนุมัติปิดเหตุ',
  closure_rejected: 'ส่งกลับให้ดำเนินการเพิ่ม', report_updated: 'แก้ไขรายการ',
  closure_request: 'บันทึกผลและส่งอนุมัติ', closure_approval: 'อนุมัติปิดเหตุ',
  closure_rejection: 'ส่งกลับให้ดำเนินการเพิ่ม', staff_role_changed: 'แก้ไขสิทธิ์เจ้าหน้าที่',
};

function canOperate(role: StaffRole) { return ['operator', 'approver', 'admin'].includes(role); }
function canApprove(role: StaffRole) { return ['approver', 'admin'].includes(role); }

export default function StaffPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaQr, setMfaQr] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMode, setMfaMode] = useState<'loading' | 'enroll' | 'challenge'>('loading');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>('active');
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthError('Supabase ยังไม่ได้ตั้งค่า'); setLoadingAuth(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoadingAuth(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!session?.access_token) throw new Error('เซสชันหมดอายุ');
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'ระบบเจ้าหน้าที่ขัดข้อง') as Error & { code?: string };
      error.code = payload.code;
      throw error;
    }
    return payload;
  }, [session?.access_token]);

  const prepareMfa = useCallback(async () => {
    if (!supabase) return;
    setMfaMode('loading');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { setAuthError('ไม่สามารถตรวจสอบ MFA ได้'); return; }
    const verified = data.totp.find(factor => factor.status === 'verified');
    if (verified) { setMfaFactorId(verified.id); setMfaMode('challenge'); }
    else setMfaMode('enroll');
  }, []);

  useEffect(() => {
    if (!session) { setStaff(null); return; }
    let cancelled = false;
    setLoadingAuth(true);
    apiFetch('/api/staff/session').then(payload => {
      if (cancelled) return;
      setStaff(payload.staff);
      setAuthError('');
      if (payload.staff.currentAal !== 'aal2') void prepareMfa();
    }).catch(error => { if (!cancelled) { setStaff(null); setAuthError(error.message); } }).finally(() => { if (!cancelled) setLoadingAuth(false); });
    return () => { cancelled = true; };
  }, [session, apiFetch, prepareMfa]);

  useEffect(() => {
    if (!staff || staff.currentAal !== 'aal2' || !supabase) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void supabase.auth.signOut(); }, staff.idleTimeoutMinutes * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => { clearTimeout(timer); events.forEach(event => window.removeEventListener(event, reset)); };
  }, [staff]);

  const loadData = useCallback(async () => {
    if (!staff || staff.currentAal !== 'aal2') return;
    setLoadingData(true);
    try {
      if (activeTab === 'audit') setAuditEvents((await apiFetch('/api/staff/audit')).events);
      else if (activeTab === 'users') setStaffUsers((await apiFetch('/api/staff/users')).users);
      else setReports((await apiFetch(`/api/staff/reports?scope=${activeTab}`)).reports);
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: error instanceof Error ? error.message : 'กรุณาลองใหม่' });
    } finally { setLoadingData(false); }
  }, [activeTab, apiFetch, staff]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setIsLoggingIn(true); setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    setIsLoggingIn(false);
  };

  const startMfaEnrollment = async () => {
    if (!supabase) return;
    setMfaBusy(true); setAuthError('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Bo Luang Staff Portal' });
    if (error) setAuthError('เริ่มตั้งค่า MFA ไม่สำเร็จ');
    else { setMfaFactorId(data.id); setMfaQr(data.totp.qr_code); setMfaSecret(data.totp.secret); }
    setMfaBusy(false);
  };

  const verifyMfa = async () => {
    if (!supabase || !mfaFactorId || !/^\d{6}$/.test(mfaCode)) { setAuthError('กรุณากรอกรหัส 6 หลักจากแอป Authenticator'); return; }
    setMfaBusy(true); setAuthError('');
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error) { setAuthError('สร้างคำขอ MFA ไม่สำเร็จ'); setMfaBusy(false); return; }
    const verify = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.data.id, code: mfaCode });
    if (verify.error) { setAuthError('รหัสไม่ถูกต้องหรือหมดอายุ'); setMfaBusy(false); return; }
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) setSession(refreshed.data.session);
    setMfaBusy(false);
  };

  const submitAction = async (report: StaffReport) => {
    const result = await Swal.fire({
      title: 'บันทึกผลและส่งขออนุมัติปิดเหตุ',
      html: '<textarea id="action-details" class="swal2-textarea" placeholder="รายละเอียดการดำเนินงาน"></textarea><input id="action-image-1" type="file" accept="image/jpeg,image/png,image/webp" class="swal2-file"><input id="action-image-2" type="file" accept="image/jpeg,image/png,image/webp" class="swal2-file">',
      showCancelButton: true, confirmButtonText: 'บันทึกและส่งอนุมัติ', cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const details = (document.getElementById('action-details') as HTMLTextAreaElement)?.value.trim();
        if (!details || details.length < 3) { Swal.showValidationMessage('กรุณาระบุรายละเอียดอย่างน้อย 3 ตัวอักษร'); return false; }
        return {
          details,
          image1: (document.getElementById('action-image-1') as HTMLInputElement)?.files?.[0],
          image2: (document.getElementById('action-image-2') as HTMLInputElement)?.files?.[0],
        };
      },
    });
    if (!result.value) return;
    const form = new FormData(); form.set('details', result.value.details);
    if (result.value.image1) form.set('image1', result.value.image1);
    if (result.value.image2) form.set('image2', result.value.image2);
    try {
      await apiFetch(`/api/staff/reports/${report.id}/action`, { method: 'POST', body: form });
      await Swal.fire({ icon: 'success', title: 'ส่งให้ผู้อนุมัติแล้ว', text: 'รายการยังไม่ถูกปิดจนกว่าผู้มีสิทธิ์จะอนุมัติ' });
      void loadData();
    } catch (error) { Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error instanceof Error ? error.message : 'กรุณาลองใหม่' }); }
  };

  const decideClosure = async (report: StaffReport, decision: 'approve' | 'reject') => {
    const result = await Swal.fire({
      icon: decision === 'approve' ? 'question' : 'warning',
      title: decision === 'approve' ? 'ยืนยันอนุมัติปิดเหตุ' : 'ส่งกลับให้ดำเนินการเพิ่ม',
      input: 'textarea', inputLabel: 'หมายเหตุการพิจารณา', inputPlaceholder: 'ระบุเหตุผลหรือข้อสั่งการ...',
      showCancelButton: true, confirmButtonText: decision === 'approve' ? 'อนุมัติปิดเหตุ' : 'ส่งกลับ', cancelButtonText: 'ยกเลิก',
      confirmButtonColor: decision === 'approve' ? '#059669' : '#d97706',
    });
    if (!result.isConfirmed) return;
    try {
      await apiFetch(`/api/staff/reports/${report.id}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note: result.value || '' }) });
      await Swal.fire({ icon: 'success', title: decision === 'approve' ? 'ปิดเหตุแล้ว' : 'ส่งกลับแล้ว' });
      void loadData();
    } catch (error) { Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: error instanceof Error ? error.message : 'กรุณาลองใหม่' }); }
  };

  const updateStaffRole = async (user: StaffUser, role: StaffRole, active: boolean) => {
    try {
      await apiFetch('/api/staff/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.user_id, role, active }) });
      void loadData();
    } catch (error) { Swal.fire({ icon: 'error', title: 'แก้ไขสิทธิ์ไม่สำเร็จ', text: error instanceof Error ? error.message : 'กรุณาลองใหม่' }); }
  };

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ id: PortalTab; label: string }> = [
      { id: 'active', label: 'กำลังดำเนินการ' }, { id: 'pending_approval', label: 'รออนุมัติ' }, { id: 'closed', label: 'ปิดเหตุแล้ว' },
    ];
    if (staff?.role === 'admin') tabs.push({ id: 'audit', label: 'Audit Log' }, { id: 'users', label: 'สิทธิ์เจ้าหน้าที่' });
    return tabs;
  }, [staff?.role]);

  if (loadingAuth) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">กำลังตรวจสอบสิทธิ์...</div>;

  if (!session) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
      <form onSubmit={handleLogin} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">Staff Portal</p><h1 className="mt-2 text-2xl font-black">ระบบปฏิบัติการเจ้าหน้าที่</h1><p className="mt-1 text-sm text-slate-400">เข้าสู่ระบบด้วยบัญชีที่เทศบาลอนุมัติเท่านั้น</p></div>
        {authError ? <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{authError}</p> : null}
        <label className="block text-sm font-bold text-slate-300">อีเมล<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white" /></label>
        <label className="block text-sm font-bold text-slate-300">รหัสผ่าน<input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white" /></label>
        <button disabled={isLoggingIn} className="w-full rounded-xl bg-sky-600 px-4 py-3 font-bold hover:bg-sky-500 disabled:opacity-60">{isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        <Link href="/" className="block text-center text-sm text-slate-400 hover:text-white">← กลับหน้าหลัก</Link>
      </form>
    </div>
  );

  if (!staff) return <AccessMessage message={authError || 'บัญชีนี้ไม่ได้รับสิทธิ์ใช้งาน'} onLogout={() => supabase?.auth.signOut()} />;

  if (staff.currentAal !== 'aal2') return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-amber-700/60 bg-slate-900 p-7 shadow-2xl" aria-labelledby="mfa-title">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">บังคับใช้ MFA</p><h1 id="mfa-title" className="mt-2 text-2xl font-black">ยืนยันตัวตนสองขั้นตอน</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">Staff Portal ต้องใช้ระดับความมั่นใจ AAL2 ก่อนเปิดข้อมูลคำร้องหรือแก้ไขสถานะ</p>
        {authError ? <p role="alert" className="mt-4 rounded-lg border border-rose-800 bg-rose-950/50 p-3 text-sm text-rose-200">{authError}</p> : null}
        {mfaMode === 'loading' ? <p className="mt-6 text-slate-400">กำลังตรวจสอบอุปกรณ์ MFA...</p> : null}
        {mfaMode === 'enroll' && !mfaQr ? <button onClick={startMfaEnrollment} disabled={mfaBusy} className="mt-6 w-full rounded-xl bg-amber-600 px-4 py-3 font-bold hover:bg-amber-500">ตั้งค่าด้วยแอป Authenticator</button> : null}
        {mfaQr ? <div className="mt-5 rounded-xl bg-white p-4 text-center"><img src={mfaQr} alt="QR Code สำหรับตั้งค่า MFA" className="mx-auto h-52 w-52" /><p className="mt-2 break-all font-mono text-xs text-slate-700">Secret: {mfaSecret}</p></div> : null}
        {(mfaMode === 'challenge' || mfaQr) ? <div className="mt-5 space-y-3"><label className="block text-sm font-bold text-slate-300">รหัสจาก Authenticator<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em]" /></label><button onClick={verifyMfa} disabled={mfaBusy} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold hover:bg-emerald-500">ยืนยันรหัส 6 หลัก</button></div> : null}
        <button onClick={() => supabase?.auth.signOut()} className="mt-4 w-full text-sm text-slate-400 hover:text-white">ออกจากระบบ</button>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black">Staff Portal</h1><p className="text-xs text-slate-400">{staff.email} · {ROLE_LABELS[staff.role]} · MFA AAL2</p></div><div className="flex gap-2"><Link href="/" className="rounded-lg border border-slate-600 px-3 py-2 text-sm">หน้าหลัก</Link><button onClick={() => supabase?.auth.signOut()} className="rounded-lg border border-rose-700 px-3 py-2 text-sm text-rose-300">ออกจากระบบ</button></div></div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="rounded-xl border border-sky-800/60 bg-sky-950/30 p-4 text-xs leading-5 text-sky-100">Session policy: ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน {staff.idleTimeoutMinutes} นาที · ทุก API ตรวจ MFA AAL2 และ Role ซ้ำฝั่ง server · รูปภาพใช้ signed URL อายุ 5 นาที</div>
        <nav className="flex flex-wrap gap-2" aria-label="เมนู Staff Portal">{visibleTabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} aria-pressed={activeTab === tab.id} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${activeTab === tab.id ? 'bg-sky-600 text-white' : 'border border-slate-700 bg-slate-900 text-slate-300'}`}>{tab.label}</button>)}<button onClick={() => void loadData()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm">รีเฟรช</button></nav>
        {loadingData ? <p role="status" className="py-12 text-center text-slate-400">กำลังโหลดข้อมูล...</p> : null}
        {!loadingData && activeTab === 'audit' ? <AuditTable events={auditEvents} /> : null}
        {!loadingData && activeTab === 'users' ? <UsersTable users={staffUsers} currentUserId={staff.id} onChange={updateStaffRole} /> : null}
        {!loadingData && !['audit', 'users'].includes(activeTab) ? <section className="space-y-4" aria-label="รายการแจ้งเหตุ">{reports.length ? reports.map(report => <ReportCard key={report.id} report={report} role={staff.role} onAction={submitAction} onDecision={decideClosure} />) : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">ไม่พบรายการในสถานะนี้</p>}</section> : null}
      </main>
    </div>
  );
}

function AccessMessage({ message, onLogout }: { message: string; onLogout: () => void }) { return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white"><div className="max-w-md rounded-2xl border border-rose-800 bg-slate-900 p-7 text-center"><h1 className="text-xl font-black">ไม่สามารถเข้า Staff Portal</h1><p className="mt-3 text-sm text-rose-200">{message}</p><button onClick={onLogout} className="mt-5 rounded-xl bg-slate-700 px-4 py-2 font-bold">ออกจากระบบ</button></div></div>; }

function ReportCard({ report, role, onAction, onDecision }: { report: StaffReport; role: StaffRole; onAction: (report: StaffReport) => void; onDecision: (report: StaffReport, decision: 'approve' | 'reject') => void }) {
  const images = [report.beforeImageUrl, report.resultImageUrl, report.resultImageUrl2].filter((value): value is string => Boolean(value));
  return <article className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{new Date(report.created_at).toLocaleString('th-TH')} · {report.village_name}</p><h2 className="mt-1 text-lg font-extrabold">{report.risk_type}</h2><p className="mt-1 text-sm text-slate-300">ระดับ {report.severity_level ?? '-'} · {report.status}</p></div><span className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1 text-xs font-bold text-sky-200">{report.workflow_state}</span></div><p className="mt-4 rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-200">{report.description || 'ไม่มีรายละเอียด'}</p><p className="mt-3 text-xs text-slate-400">ผู้แจ้ง: {report.reporter_name || 'ไม่ระบุ'} ({report.reporter_role || '-'}) · <a className="text-sky-300 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`}>เปิดพิกัด</a></p>{images.length ? <div className="mt-4 flex flex-wrap gap-2">{images.map((src, index) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`ภาพประกอบ ${index + 1}`} className="h-24 w-24 rounded-lg border border-slate-600 object-cover" /></a>)}</div> : null}{report.actions?.length ? <div className="mt-4 border-t border-slate-700 pt-4"><h3 className="text-sm font-bold">ลำดับการดำเนินงาน</h3><ul className="mt-2 space-y-2">{report.actions.map(action => <li key={action.id} className="rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-300"><strong>{ACTION_LABELS[action.action_kind] || action.action_kind}</strong> · {ROLE_LABELS[action.actor_role]} · {new Date(action.created_at).toLocaleString('th-TH')}<br />{action.details}</li>)}</ul></div> : null}<div className="mt-5 flex flex-wrap gap-2">{canOperate(role) && report.workflow_state !== 'closed' && report.workflow_state !== 'pending_approval' ? <button onClick={() => onAction(report)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold">บันทึกผลและส่งอนุมัติ</button> : null}{canApprove(role) && report.workflow_state === 'pending_approval' ? <><button onClick={() => onDecision(report, 'approve')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold">อนุมัติปิดเหตุ</button><button onClick={() => onDecision(report, 'reject')} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold">ส่งกลับ</button></> : null}{role === 'viewer' ? <span className="text-xs text-slate-500">สิทธิ์ดูข้อมูลเท่านั้น</span> : null}</div></article>;
}

function AuditTable({ events }: { events: AuditEvent[] }) { return <div className="overflow-x-auto rounded-2xl border border-slate-700"><table className="min-w-full divide-y divide-slate-700 text-left text-sm"><thead className="bg-slate-900"><tr><th className="p-3">เวลา</th><th className="p-3">เหตุการณ์</th><th className="p-3">Role</th><th className="p-3">Report</th><th className="p-3">IP/Session fingerprint</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">{events.map(event => <tr key={event.id}><td className="p-3">{new Date(event.created_at).toLocaleString('th-TH')}</td><td className="p-3">{ACTION_LABELS[event.action] || event.action}</td><td className="p-3">{event.actor_role ? ROLE_LABELS[event.actor_role] : '-'}</td><td className="p-3 font-mono text-xs">{event.report_id}</td><td className="p-3 font-mono text-xs">{event.ip_hash || '-'} / {event.session_hash || '-'}</td></tr>)}</tbody></table></div>; }

function UsersTable({ users, currentUserId, onChange }: { users: StaffUser[]; currentUserId: string; onChange: (user: StaffUser, role: StaffRole, active: boolean) => void }) { return <div className="overflow-x-auto rounded-2xl border border-slate-700"><table className="min-w-full divide-y divide-slate-700 text-left text-sm"><thead className="bg-slate-900"><tr><th className="p-3">บัญชี</th><th className="p-3">Role</th><th className="p-3">สถานะ</th></tr></thead><tbody className="divide-y divide-slate-800 bg-slate-950">{users.map(user => <tr key={user.user_id}><td className="p-3">{user.email || user.display_name || user.user_id}{user.user_id === currentUserId ? ' (คุณ)' : ''}</td><td className="p-3"><select disabled={user.user_id === currentUserId} value={user.role} onChange={event => onChange(user, event.target.value as StaffRole, user.active)} className="rounded-lg border border-slate-600 bg-slate-900 p-2">{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></td><td className="p-3"><label className="flex items-center gap-2"><input type="checkbox" disabled={user.user_id === currentUserId} checked={user.active} onChange={event => onChange(user, user.role, event.target.checked)} /> เปิดใช้งาน</label></td></tr>)}</tbody></table></div>; }
