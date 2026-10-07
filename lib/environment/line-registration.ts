export type LineRegistrationAudience = 'staff' | 'public';

export function parseLineGroupRegistration(text: string | undefined) {
  const match = text?.trim().match(/^ลงทะเบียนกลุ่ม\s+(เจ้าหน้าที่|สาธารณะ)\s+(.+)$/);
  if (!match) return null;
  return {
    audience: (match[1] === 'เจ้าหน้าที่' ? 'staff' : 'public') as LineRegistrationAudience,
    token: match[2].trim(),
  };
}

export function registrationSuccessText(audience: LineRegistrationAudience) {
  return audience === 'staff'
    ? 'ลงทะเบียนกลุ่มเจ้าหน้าที่สำเร็จ'
    : 'ลงทะเบียนกลุ่มสาธารณะสำเร็จ';
}
