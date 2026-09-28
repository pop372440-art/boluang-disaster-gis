import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export const STAFF_ROLES = ['viewer', 'operator', 'approver', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const ROLE_RANK: Record<StaffRole, number> = {
  viewer: 0,
  operator: 1,
  approver: 2,
  admin: 3,
};

type JwtClaims = {
  aal?: string;
  session_id?: string;
  exp?: number;
};

export class StaffAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type StaffContext = {
  client: SupabaseClient;
  user: User;
  role: StaffRole;
  aal: string;
  ipHash: string | null;
  sessionHash: string | null;
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && STAFF_ROLES.includes(value as StaffRole);
}

export function roleAtLeast(role: StaffRole, required: StaffRole) {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function staffServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StaffAuthError(503, 'STAFF_NOT_CONFIGURED', 'ระบบเจ้าหน้าที่ยังไม่พร้อมใช้งาน');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function decodeVerifiedJwtClaims(token: string): JwtClaims {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
  } catch {
    return {};
  }
}

function fingerprint(value: string | null) {
  if (!value) return null;
  const pepper = process.env.STAFF_AUDIT_PEPPER || process.env.REPORT_STATUS_AUDIT_PEPPER;
  if (!pepper || pepper.length < 32) return null;
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex').slice(0, 24);
}

export async function authenticateStaff(
  request: Request,
  options: { minimumRole?: StaffRole; requireAal2?: boolean } = {},
): Promise<StaffContext> {
  const token = bearerToken(request);
  if (!token) throw new StaffAuthError(401, 'AUTH_REQUIRED', 'กรุณาเข้าสู่ระบบเจ้าหน้าที่');

  const client = staffServerClient();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new StaffAuthError(401, 'SESSION_INVALID', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');

  const { data: profile, error: profileError } = await client
    .from('staff_profiles')
    .select('role,active')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (profileError) throw new StaffAuthError(503, 'STAFF_PROFILE_UNAVAILABLE', 'ไม่สามารถตรวจสอบสิทธิ์เจ้าหน้าที่ได้');
  if (!profile?.active || !isStaffRole(profile.role)) throw new StaffAuthError(403, 'STAFF_ACCESS_DENIED', 'บัญชีนี้ไม่ได้รับสิทธิ์ใช้งาน Staff Portal');

  const claims = decodeVerifiedJwtClaims(token);
  const aal = claims.aal || 'aal1';
  if (options.requireAal2 !== false && aal !== 'aal2') {
    throw new StaffAuthError(403, 'MFA_REQUIRED', 'กรุณายืนยันตัวตนสองขั้นตอนก่อนดำเนินการ');
  }
  if (options.minimumRole && !roleAtLeast(profile.role, options.minimumRole)) {
    throw new StaffAuthError(403, 'ROLE_FORBIDDEN', 'สิทธิ์ของคุณไม่เพียงพอสำหรับรายการนี้');
  }

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || request.headers.get('x-real-ip');
  return {
    client,
    user: userData.user,
    role: profile.role,
    aal,
    ipHash: fingerprint(ip || null),
    sessionHash: fingerprint(claims.session_id || null),
  };
}

export function staffErrorResponse(error: unknown) {
  if (error instanceof StaffAuthError) {
    return Response.json({ ok: false, code: error.code, error: error.message }, {
      status: error.status,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  console.error(JSON.stringify({ event: 'staff_api_failed', at: new Date().toISOString() }));
  return Response.json({ ok: false, code: 'STAFF_API_ERROR', error: 'ระบบเจ้าหน้าที่ขัดข้องชั่วคราว' }, {
    status: 500,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
