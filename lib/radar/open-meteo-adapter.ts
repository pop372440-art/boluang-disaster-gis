export type Coordinate = { latitude: number; longitude: number };

export type OpenMeteoLocationForecast = {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    precipitation: Array<number | null>;
    precipitationProbability: Array<number | null>;
  };
  daily: {
    time: string[];
    precipitationSum: Array<number | null>;
  };
};

export type OpenMeteoForecastBatch = {
  source: 'Open-Meteo';
  fetchedAt: string;
  timezone: 'Asia/Bangkok';
  locations: OpenMeteoLocationForecast[];
};

const nullableNumberArray = (value: unknown): Array<number | null> => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item == null) return null;
    const number = Number(item);
    return Number.isFinite(number) && number >= 0 ? number : null;
  });
};

const stringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

export function parseOpenMeteoResponse(value: unknown, coordinates: Coordinate[]): OpenMeteoLocationForecast[] {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length !== coordinates.length) {
    throw new Error(`Open-Meteo ส่งข้อมูล ${rows.length} จุด แต่ร้องขอ ${coordinates.length} จุด`);
  }

  return rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Open-Meteo จุดที่ ${index + 1} ไม่ถูกต้อง`);
    const raw = row as Record<string, any>;
    const time = stringArray(raw.hourly?.time);
    const precipitation = nullableNumberArray(raw.hourly?.precipitation);
    const precipitationProbability = nullableNumberArray(raw.hourly?.precipitation_probability);
    if (!time.length || precipitation.length !== time.length) {
      throw new Error(`Open-Meteo จุดที่ ${index + 1} ไม่มีข้อมูลฝนรายชั่วโมงครบถ้วน`);
    }

    return {
      latitude: coordinates[index].latitude,
      longitude: coordinates[index].longitude,
      hourly: { time, precipitation, precipitationProbability },
      daily: {
        time: stringArray(raw.daily?.time),
        precipitationSum: nullableNumberArray(raw.daily?.precipitation_sum),
      },
    };
  });
}

export function buildOpenMeteoUrl(coordinates: Coordinate[]) {
  if (!coordinates.length || coordinates.length > 25) throw new Error('รองรับพิกัดครั้งละ 1–25 จุด');
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', coordinates.map((point) => point.latitude.toFixed(5)).join(','));
  url.searchParams.set('longitude', coordinates.map((point) => point.longitude.toFixed(5)).join(','));
  url.searchParams.set('hourly', 'precipitation,precipitation_probability');
  url.searchParams.set('daily', 'precipitation_sum');
  url.searchParams.set('past_days', '7');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'Asia/Bangkok');
  return url;
}

export function parseForecastApiResponse(value: unknown): OpenMeteoForecastBatch {
  if (!value || typeof value !== 'object') throw new Error('Forecast response ไม่ถูกต้อง');
  const raw = value as Partial<OpenMeteoForecastBatch>;
  if (raw.source !== 'Open-Meteo' || typeof raw.fetchedAt !== 'string' || !Array.isArray(raw.locations)) {
    throw new Error('Forecast response ขาด source, timestamp หรือ locations');
  }
  return raw as OpenMeteoForecastBatch;
}
