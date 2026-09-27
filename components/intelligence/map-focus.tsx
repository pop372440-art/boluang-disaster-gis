'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

type MapFocusProps = {
  feature: GeoJSON.Feature | null;
};

export default function MapFocus({ feature }: MapFocusProps) {
  const map = useMap();

  useEffect(() => {
    if (!feature) return;
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: true, duration: 0.8 });
    }
  }, [feature, map]);

  return null;
}
