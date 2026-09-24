'use client';

import { useEffect, type MutableRefObject } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

export function ClickableMap({
  onMapClick,
  onZoom,
  coordinateMode = false,
}: {
  onMapClick: (lat: number, lng: number) => void;
  onZoom: (zoom: number) => void;
  coordinateMode?: boolean;
}) {
  const map = useMapEvents({
    click(event) { onMapClick(event.latlng.lat, event.latlng.lng); },
    zoomend() { onZoom(map.getZoom()); },
  });
  useEffect(() => {
    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = coordinateMode ? 'crosshair' : '';
    return () => { container.style.cursor = previousCursor; };
  }, [coordinateMode, map]);
  return null;
}

export function MapRefBinder({ mapRef }: { mapRef: MutableRefObject<any> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

export function MapScale() {
  const map = useMap();
  useEffect(() => {
    const leaflet = require('leaflet');
    const control = leaflet.control.scale({ imperial: false, metric: true, position: 'bottomright', maxWidth: 120 });
    control.addTo(map);
    return () => { control.remove(); };
  }, [map]);
  return null;
}
