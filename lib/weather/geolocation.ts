export const CURRENT_LOCATION_ZOOM = 16;

export type GeolocationFailure = {
  code?: number;
};

export function shouldRetryGeolocation(error: GeolocationFailure): boolean {
  return error.code === 2 || error.code === 3;
}

export function geolocationFailureCopy(
  error: GeolocationFailure,
  secureContext = true
): { title: string; text: string } {
  if (!secureContext) {
    return {
      title: 'เปิดตำแหน่งไม่ได้',
      text: 'ฟังก์ชันพิกัดปัจจุบันใช้งานได้ผ่าน HTTPS เท่านั้น กรุณาเปิดเว็บไซต์จากลิงก์ที่ปลอดภัย',
    };
  }

  if (error.code === 1) {
    return {
      title: 'ยังไม่ได้รับสิทธิ์ตำแหน่ง',
      text: 'กรุณาอนุญาต Location จากการตั้งค่าเว็บไซต์ แล้วกดลองอีกครั้ง หรือแตะจุดที่ต้องการบนแผนที่',
    };
  }

  if (error.code === 2) {
    return {
      title: 'อุปกรณ์ส่งตำแหน่งไม่ได้',
      text: 'กรุณาเปิดบริการ Location และ Wi-Fi/อินเทอร์เน็ต แล้วลองใหม่ หรือแตะจุดที่ต้องการบนแผนที่',
    };
  }

  if (error.code === 3) {
    return {
      title: 'ค้นหาตำแหน่งนานเกินไป',
      text: 'สัญญาณตำแหน่งอาจอ่อน กรุณาลองใหม่ในที่โล่ง หรือแตะจุดที่ต้องการบนแผนที่',
    };
  }

  return {
    title: 'ไม่สามารถระบุตำแหน่งได้',
    text: 'กรุณาลองใหม่ หรือแตะจุดที่ต้องการบนแผนที่',
  };
}
