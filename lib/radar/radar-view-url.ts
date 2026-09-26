export type RadarView = {
  latitude: number;
  longitude: number;
  zoom: number;
};

const isAllowedCoordinate = (latitude: number, longitude: number) =>
  latitude >= 17.5 && latitude <= 19 && longitude >= 97.5 && longitude <= 99.5;

export function parseRadarView(search: string): RadarView | null {
  const [layer, latitudeValue, longitudeValue, zoomValue] = search.replace(/^\?/, '').split(',');
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const zoom = Number(zoomValue);
  if (layer !== 'radar' || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      !Number.isFinite(zoom) || !isAllowedCoordinate(latitude, longitude)) return null;
  return { latitude, longitude, zoom: Math.min(20, Math.max(5, Math.round(zoom))) };
}

export function buildRadarViewSearch({ latitude, longitude, zoom }: RadarView) {
  return `?radar,${latitude.toFixed(5)},${longitude.toFixed(5)},${Math.min(20, Math.max(5, Math.round(zoom)))}`;
}
