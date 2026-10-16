'use client';

import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

type MapRotationControlProps = {
  isMobile: boolean;
  rightPanelOpen: boolean;
};

export default function MapRotationControl({ isMobile, rightPanelOpen }: MapRotationControlProps) {
  const map = useMap() as any;
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    const syncBearing = () => setBearing(Math.round(map.getBearing() || 0) % 360);
    map.on('rotate', syncBearing);
    syncBearing();
    return () => map.off('rotate', syncBearing);
  }, [map]);

  const setMapBearing = (value: number) => {
    map.setBearing(value);
    setBearing(value);
  };

  return (
    <div
      className={`leaflet-control absolute top-[150px] z-[1000] flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-slate-700 ${isMobile ? 'right-3 w-[min(210px,calc(100vw-100px))]' : rightPanelOpen ? 'right-[420px] w-[230px]' : 'right-4 w-[230px]'}`}
      aria-label="ควบคุมการหมุนแผนที่"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setMapBearing(0)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-700 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        aria-label="กลับทิศเหนือ"
        title="กลับทิศเหนือ"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ transform: `rotate(${bearing}deg)` }} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m14.8 9.2-1.9 5.7-5.7 1.9 1.9-5.7 5.7-1.9Z" fill="currentColor" strokeLinejoin="round" />
          <path d="M12 3v2" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold leading-4">
          <label htmlFor="gis-map-bearing">หมุนแผนที่</label>
          <output htmlFor="gis-map-bearing" className="tabular-nums text-slate-600">{bearing}°</output>
        </div>
        <input
          id="gis-map-bearing"
          type="range"
          min="0"
          max="359"
          step="1"
          value={bearing}
          onChange={(event) => setMapBearing(Number(event.target.value))}
          className="block h-5 w-full cursor-pointer accent-sky-600"
          aria-label="ปรับมุมหมุนแผนที่"
        />
      </div>
    </div>
  );
}

