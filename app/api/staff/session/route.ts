import { authenticateStaff, staffErrorResponse } from '@/lib/staff/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const staff = await authenticateStaff(request, { requireAal2: false });
    return Response.json({
      ok: true,
      staff: {
        id: staff.user.id,
        email: staff.user.email ?? null,
        role: staff.role,
        currentAal: staff.aal,
        mfaRequired: true,
        idleTimeoutMinutes: 30,
      },
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return staffErrorResponse(error);
  }
}

