import { containsPoint } from './area-context.ts';
import type { PolygonGeometry } from '../radar/geojson-validation.ts';
import { evaluateStationFreshness, finiteMeasurement } from '../flood/station-quality.ts';

export const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function stationRows(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  const root = record(value), data = record(root.data);
  for (const item of [root.data, record(data.waterlevel_data).data, record(root.waterlevel_data).data, record(data.rain_data).data, record(root.rain_data).data]) if (Array.isArray(item)) return item;
  return null;
}
export function localStationEvidence(payload: unknown, type: 'water' | 'rain', area: { lat: number; lng: number }, now: number, geometry?: PolygonGeometry) {
  return (stationRows(payload) ?? []).flatMap(item => {
    const row = record(item), station = record(row.station);
    const rawLat = station.tele_station_lat ?? row.tele_station_lat ?? row.lat;
    const rawLng = station.tele_station_long ?? row.tele_station_long ?? row.lng;
    if (rawLat === null || rawLat === undefined || rawLat === '' || rawLng === null || rawLng === undefined || rawLng === '') return [];
    const lat = Number(rawLat), lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const radians = Math.PI / 180;
    const dLat = (lat - area.lat) * radians, dLng = (lng - area.lng) * radians;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(area.lat * radians) * Math.sin(dLng / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    if (distanceKm > 50) return [];
    const name = station.tele_station_name ?? row.tele_station_name;
    const time = type === 'water' ? row.waterlevel_datetime ?? row.waterlevel_date ?? row.datetime : row.rainfall_datetime ?? row.rain_datetime ?? row.datetime;
    const freshness = evaluateStationFreshness(typeof time === 'string' ? time : null, now);
    const value = type === 'water' ? finiteMeasurement(row.water_level, row.waterlevel, row.wl) : finiteMeasurement(row.rain_24h, row.rain24h, row.rain);
    return [{ lat, lng, name: typeof name === 'string' ? name : String(record(name).th ?? 'ไม่ระบุชื่อสถานี'), distanceKm, type, value, freshness,
      withinVillage: geometry ? containsPoint([lng, lat], geometry) : null }];
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}
