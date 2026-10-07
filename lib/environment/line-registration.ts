export type LineRegistrationAudience = 'staff' | 'public';
export type LineRoutingScope = 'all' | 'wildfire' | 'general';

export function parseLineGroupRegistration(text: string | undefined) {
  const match = text?.trim().match(/^ลงทะเบียนกลุ่ม\s+(เจ้าหน้าที่|สิงห์ไฟ|เครือข่าย|สาธารณะ)\s+(.+)$/);
  if (!match) return null;
  const label = match[1];
  return {
    audience: (label === 'เจ้าหน้าที่' ? 'staff' : 'public') as LineRegistrationAudience,
    routingScope: (label === 'เจ้าหน้าที่' ? 'all' : label === 'สิงห์ไฟ' ? 'wildfire' : 'general') as LineRoutingScope,
    token: match[2].trim(),
  };
}

export function registrationSuccessText(audience: LineRegistrationAudience, routingScope: LineRoutingScope) {
  return audience === 'staff'
    ? 'ลงทะเบียนกลุ่มเจ้าหน้าที่สำเร็จ'
    : routingScope === 'wildfire'
      ? 'ลงทะเบียนกลุ่มสิงห์ไฟสำเร็จ'
      : 'ลงทะเบียนกลุ่มเครือข่ายแจ้งเตือนสำเร็จ';
}
