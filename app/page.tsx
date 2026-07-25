'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// 🗺️ โหลด Leaflet แบบ Dynamic
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const ZoomControl = dynamic(() => import('react-leaflet').then(mod => mod.ZoomControl), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// 💎 UI Component: Toggle แบบกล่องพรีเมียม (ปรับลด Padding ให้กระชับพื้นที่แนวตั้ง)
const CustomToggleBox = ({ label, active, onClick, dotColor = '#38bdf8', isRadio = false }: any) => (
  <div 
    className={`flex items-center space-x-3 px-3 py-2 rounded-xl border transition-all duration-300 cursor-pointer select-none mb-1.5 ${
      active ? 'border-[#38bdf8]/50 bg-[#38bdf8]/10 shadow-[inset_0_0_10px_rgba(56,189,248,0.1)]' : 'border-[#1e293b] bg-[#0b1121]/50 hover:bg-[#1e293b]/50'
    }`}
    onClick={onClick}
  >
    {isRadio ? (
      <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'border-[#38bdf8]' : 'border-gray-500'}`}>
        {active && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}
      </div>
    ) : (
      <div className={`relative w-9 h-5 rounded-full transition-colors duration-300 flex-shrink-0 ${active ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
        <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-4 w-4 transition-transform duration-300 shadow-sm ${active ? 'translate-x-4' : 'translate-x-0'}`}></div>
      </div>
    )}
    <div className="flex items-center space-x-2 flex-1">
      {!isRadio && <div className="w-2.5 h-2.5 rounded-[3px] shadow-sm" style={{ backgroundColor: dotColor }}></div>}
      <span className={`text-[14px] font-medium transition-colors ${active ? 'text-white' : 'text-gray-400'}`}>{label}</span>
    </div>
  </div>
);

// 🌤️ ฟังก์ชันสภาพอากาศ
const getWmoWeatherDesc = (code: number) => {
  const codes: Record<number, string> = {
    0: 'ท้องฟ้าแจ่มใส', 1: 'มีเมฆบางส่วน', 2: 'มีเมฆครึ้ม', 3: 'มีเมฆมาก',
    45: 'มีหมอก', 48: 'มีหมอกหนา', 51: 'ฝนปรอยๆ', 61: 'ฝนตกเล็กน้อย', 63: 'ฝนตกปานกลาง', 65: 'ฝนตกหนัก',
    80: 'ฝนตกเป็นหย่อมๆ', 95: 'พายุฝนฟ้าคะนอง'
  };
  return codes[code] || 'สภาพอากาศปกติ';
};
const getWeatherEmoji = (code: number) => {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '☀️';
};

const nationalStations = [
  { name: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 }, { name: 'เชียงราย', lat: 19.9070, lng: 99.8325 },
  { name: 'แม่ฮ่องสอน', lat: 19.3020, lng: 97.9654 }, { name: 'น่าน', lat: 18.7756, lng: 100.7730 },
  { name: 'ตาก', lat: 16.8839, lng: 99.1258 }, { name: 'พิษณุโลก', lat: 16.8211, lng: 100.2659 },
  { name: 'ขอนแก่น', lat: 16.4322, lng: 102.8236 }, { name: 'อุดรธานี', lat: 17.4138, lng: 102.7872 },
  { name: 'อุบลราชธานี', lat: 15.2448, lng: 104.8473 }, { name: 'นครราชสีมา', lat: 14.9799, lng: 102.0978 }
];

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const coordsRef = useRef<HTMLSpanElement>(null);

  // 🎛️ State แผงควบคุม ซ้าย
  const [tmdWeather, setTmdWeather] = useState(false);
  const [tmdRain, setTmdRain] = useState(false);
  const [pm25, setPm25] = useState(false);
  const [windyLayer, setWindyLayer] = useState(false); 
  const [windyType, setWindyType] = useState('rain'); 

  // 🎛️ State แผงควบคุม ขวา
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showBoluang, setShowBoluang] = useState(false);   
  const [showBlock, setShowBlock] = useState(false);        
  const [showParcel, setShowParcel] = useState(false);      
  const [citizenReport, setCitizenReport] = useState(false);
  const [earthquakeLayer, setEarthquakeLayer] = useState(true);        
  const [hotspot, setHotspot] = useState(true);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showScanModal, setShowScanModal] = useState(false);

  // 📡 ข้อมูล API & GeoJSON
  const [realWeatherData, setRealWeatherData] = useState<any>(null);
  const [villageRainData, setVillageRainData] = useState<any[]>([]); 
  const [nationalAirData, setNationalAirData] = useState<any[]>([]);
  
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoHotspot, setGeoHotspot] = useState<any>(null);
  const [geoEarthquake, setGeoEarthquake] = useState<any>(null);

  const [mapRef, setMapRef] = useState<any>(null);
  
  // 🌟 กำหนดจุดศูนย์กลางเริ่มต้น
  const initialCenter = { lat: 14.8700, lng: 100.9925, zoom: 6 };
  const [iframeState, setIframeState] = useState(initialCenter);
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const [currentZoom, setCurrentZoom] = useState(6);
  const syncData = useRef(initialCenter);

  const activeLayersCount = [satelliteLayer, showBoluang, showBlock, showParcel, citizenReport, earthquakeLayer, hotspot].filter(Boolean).length;

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') setQrUrl(window.location.origin + '/report');

    const fetchLocalBaseData = async () => {
      try {
        const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.1633&longitude=98.3744&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&timezone=Asia%2FBangkok');
        setRealWeatherData((await weatherRes.json()).current);
      } catch (error) { console.error(error); }
    };
    fetchLocalBaseData();

    const ts = Date.now(); 
    const loadGeoJSON = async (url: string, setter: any) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          let data = await res.json();
          if (Array.isArray(data)) data = { type: "FeatureCollection", features: data };
          setter(data);
        }
      } catch (e) { console.error(e); }
    };

    loadGeoJSON(`/geojson/boluang.json?v=${ts}`, setGeoBoluang);
    loadGeoJSON(`/geojson/block.json?v=${ts}`, setGeoBlock); 
    loadGeoJSON(`/geojson/parcel.json?v=${ts}`, setGeoParcel);
    
    // GISTDA API 
    loadGeoJSON(`https://api.sphere.gistda.or.th/services/info/disaster-recurring?lon=98.3744&lat=18.1633&disaster_type=hotspot&key=AF9B1EEFF30042208F1DE95B579E7F90`, setGeoHotspot);
    loadGeoJSON(`/geojson/earthquake.geojson?v=${ts}`, setGeoEarthquake);
  }, []);

  useEffect(() => {
    if (mapRef && (showBoluang || showBlock)) {
      mapRef.flyTo([18.1633, 98.3744], 12, { duration: 2.5, easeLinearity: 0.25 });
    }
  }, [showBoluang, showBlock, mapRef]);

  const formatVillageName = (rawName: any) => {
    if (!rawName) return 'พื้นที่หมู่บ้าน';
    const safeName = String(rawName); 
    let cName = safeName.replace(/^(บ้าน|บ\.|หมู่ที่\s*\d+|หมู่\s*\d+)/, '').replace(/\s+/g, '');
    if (cName.includes('บ่อหลวง')) cName = 'บ้านบ่อหลวง';
    else if (cName === 'ขุน' || cName.includes('บ้านขุน')) cName = 'บ้านขุน';
    else cName = `บ้าน${cName}`;
    return cName;
  };

  const villageLabels = useMemo(() => {
    const vMap: Record<string, { sumLat: number, sumLng: number, count: number }> = {};
    if (geoBlock && geoBlock.features) {
      geoBlock.features.forEach((f: any) => {
        const props = f.properties || {};
        let rawName = props.own_villag || props.name_th || props.vil_name || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || 'ไม่ระบุ'}`;
        let cName = formatVillageName(rawName);
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        const extractCoords = (coords: any[]) => {
          if (!coords) return;
          if (typeof coords[0] === 'number') {
            if (coords[1] < minLat) minLat = coords[1];
            if (coords[1] > maxLat) maxLat = coords[1];
            if (coords[0] < minLng) minLng = coords[0];
            if (coords[0] > maxLng) maxLng = coords[0];
          } else if (Array.isArray(coords)) { coords.forEach(extractCoords); }
        };
        extractCoords(f.geometry?.coordinates);
        if (minLat !== Infinity) {
          if (!vMap[cName]) vMap[cName] = { sumLat: 0, sumLng: 0, count: 0 };
          vMap[cName].sumLat += (minLat + maxLat) / 2;
          vMap[cName].sumLng += (minLng + maxLng) / 2;
          vMap[cName].count += 1;
        }
      });
    }
    return Object.keys(vMap).map(name => ({ name, lat: vMap[name].sumLat / vMap[name].count, lng: vMap[name].sumLng / vMap[name].count }));
  }, [geoBlock]);

  useEffect(() => {
    if (!tmdRain || !villageLabels || villageLabels.length === 0) return;
    const fetchVillageRain = async () => {
      try {
        const lats = villageLabels.map(v => v.lat.toFixed(4)).join(',');
        const lngs = villageLabels.map(v => v.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`;
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data)) {
          const formatted = villageLabels.map((v, i) => ({
            ...v, rainSum: data[i]?.daily?.precipitation_sum?.[0] || 0,
            tempMax: data[i]?.daily?.temperature_2m_max?.[0] || 0, tempMin: data[i]?.daily?.temperature_2m_min?.[0] || 0,
            wCode: data[i]?.daily?.weathercode?.[0] || 0, apiDate: data[i]?.daily?.time?.[0] || new Date().toISOString().split('T')[0]
          }));
          setVillageRainData(formatted);
        }
      } catch (error) { console.error(error); }
    };
    fetchVillageRain();
  }, [tmdRain, villageLabels]);

  useEffect(() => {
    if (!pm25) { setNationalAirData([]); return; }
    const fetchNationalAir = async () => {
      try {
        const lats = nationalStations.map(s => s.lat.toFixed(4)).join(',');
        const lngs = nationalStations.map(s => s.lng.toFixed(4)).join(',');
        const [aqiRes, wxRes] = await Promise.all([
          fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lngs}&current=pm2_5&timezone=Asia%2FBangkok`),
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=weathercode&timezone=Asia%2FBangkok`)
        ]);
        const aqiData = await aqiRes.json();
        const wxData = await wxRes.json();
        if (Array.isArray(aqiData) && Array.isArray(wxData)) {
          const formatted = nationalStations.map((station, i) => ({
            ...station, pm25Val: aqiData[i]?.current?.pm2_5 || 0, wCode: wxData[i]?.current?.weathercode || 0
          }));
          setNationalAirData(formatted);
        }
      } catch (error) { console.error(error); }
    };
    fetchNationalAir();
  }, [pm25]);

  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  const getVillageColor = (feature: any) => {
    const props = feature?.properties || {};
    const nameStr = String(props.own_villag || props.name_th || props.name || props.zone_name || props.id || "0");
    const colorIndex = nameStr.length % BLOCK_COLORS.length;
    return props.fill || BLOCK_COLORS[colorIndex];
  };

  const getBlockStyle = (feature: any) => ({ fillColor: getVillageColor(feature), weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
  const onEachBlockFeature = (feature: any, layer: any) => {
    const props = feature?.properties || {};
    const rawName = props.own_villag || props.name_th || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || ''}`;
    const villageName = formatVillageName(rawName);
    const defaultColor = getVillageColor(feature);

    layer.bindTooltip(villageName, { sticky: true, direction: 'auto', className: 'village-hover-tooltip', permanent: false });
    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 3, color: '#ffffff', fillColor: defaultColor, fillOpacity: 0.7, dashArray: '' });
        if (targetLayer.bringToFront) targetLayer.bringToFront(); 
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
      }
    });
  };

  const getRainCircleStyle = (rainSum: number) => {
    let radius = 8 + (rainSum * 1.5); if (radius > 35) radius = 35; 
    let color = '#38bdf8'; let fillColor = '#7dd3fc'; 
    if (rainSum === 0) { color = '#94a3b8'; fillColor = '#cbd5e1'; radius = 7; } 
    else if (rainSum > 5 && rainSum <= 20) { color = '#10b981'; fillColor = '#34d399'; } 
    else if (rainSum > 20 && rainSum <= 50) { color = '#eab308'; fillColor = '#facc15'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.7, weight: 2.5 };
  };

  const styleBoluang = { color: '#0ea5e9', weight: 3, fillOpacity: 0, interactive: false }; 
  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 

  useEffect(() => {
    if (!mapRef) return;
    const updateSyncData = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setCurrentZoom(zoom);
      setTransform({ x: 0, y: 0 });
    };

    const onMove = () => {
      const zoom = mapRef.getZoom();
      if (zoom !== syncData.current.zoom) return;
      const initialPoint = mapRef.project(syncData.current, zoom);
      const currentPoint = mapRef.project(mapRef.getCenter(), zoom);
      setTransform({ x: initialPoint.x - currentPoint.x, y: initialPoint.y - currentPoint.y });
      setIframeState(prev => ({ ...prev, lat: mapRef.getCenter().lat, lng: mapRef.getCenter().lng })); 
    };

    const onMouseMove = (e: any) => {
      if (coordsRef.current) coordsRef.current.innerText = `${e.latlng.lat.toFixed(4)}° N \u00A0 ${e.latlng.lng.toFixed(4)}° E`;
    };

    mapRef.on('move', onMove); 
    mapRef.on('moveend', updateSyncData); 
    mapRef.on('zoomend', updateSyncData);
    mapRef.on('mousemove', onMouseMove); 
    return () => { 
      mapRef.off('move', onMove); 
      mapRef.off('moveend', updateSyncData); 
      mapRef.off('zoomend', updateSyncData); 
      mapRef.off('mousemove', onMouseMove); 
    };
  }, [mapRef]);

  const windyMapUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=${iframeState.zoom}&overlay=${windyType}&product=ecmwf&level=surface&lat=${iframeState.lat}&lon=${iframeState.lng}&detailLat=${iframeState.lat}&detailLon=${iframeState.lng}&marker=false`;

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  
  const createPm25Icon = useMemo(() => {
    if (!L) return () => null;
    return (pmVal: number, wCode: number) => {
      const emoji = getWeatherEmoji(wCode);
      const html = `
        <div class="relative flex flex-col items-center justify-center w-[48px] h-[40px] bg-[#0f172a]/95 border-[1px] border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div class="absolute -top-[12px] -left-[12px] w-6 h-6 bg-[#1e293b] rounded-full border border-[#475569] flex items-center justify-center text-[12px] shadow-lg z-10">${emoji}</div>
          <span class="text-white font-bold text-[14px] leading-none mt-1.5 z-0">${pmVal.toFixed(1)}</span>
          <span class="text-[#38bdf8] text-[9px] font-bold mt-1 z-0 tracking-wider">PM2.5</span>
        </div>
      `;
      return L.divIcon({ className: 'bg-transparent border-none', html, iconSize: [48, 40], iconAnchor: [24, 20] });
    };
  }, [L]);

  const createHotspotIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 bg-[#ea580c] rounded-full blur-[8px] opacity-60"></div>
          <div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#ea580c] rounded-full shadow-[0_0_15px_rgba(234,88,12,0.9)] z-10">
            <span class="text-[#ea580c] text-[14px]">🔥</span>
          </div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  const createQuakeIcon = useMemo(() => {
    if (!L) return () => null;
    return () => L.divIcon({
      className: 'bg-transparent border-none',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 bg-[#c084fc] rounded-full blur-[8px] opacity-50"></div>
          <div class="relative flex items-center justify-center w-7 h-7 bg-[#0f172a] border-[1.5px] border-[#c084fc] rounded-full shadow-[0_0_15px_rgba(192,132,252,0.9)] z-10">
            <span class="text-[#c084fc] text-[14px] font-bold">〰</span>
          </div>
        </div>
      `,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }, [L]);

  return (
    <main className="relative w-screen h-screen bg-[#0b132b] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; cursor: crosshair !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 380px !important; }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        .leaflet-tooltip { pointer-events: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 14px !important; font-weight: 600 !important; 
          padding: 6px 14px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }

        .custom-dark-popup .leaflet-popup-content-wrapper {
          background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #1e293b !important;
          border-radius: 12px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; backdrop-filter: blur(8px) !important; padding: 0 !important; overflow: hidden;
        }
        .custom-dark-popup .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; }
        .custom-dark-popup .leaflet-popup-content { margin: 0 !important; }
        
        .popup-hotspot .leaflet-popup-content-wrapper {
          background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #ea580c !important;
          border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden;
        }
        .popup-hotspot .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #ea580c !important; border-left: 1px solid #ea580c !important; }
        .popup-hotspot .leaflet-popup-content { margin: 0 !important; }

        .popup-quake .leaflet-popup-content-wrapper {
          background-color: rgba(15, 23, 42, 0.95) !important; color: #e2e8f0 !important; border: 1px solid #a855f7 !important;
          border-radius: 8px !important; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important; padding: 0 !important; overflow: hidden;
        }
        .popup-quake .leaflet-popup-tip { background-color: rgba(15, 23, 42, 0.95) !important; border-top: 1px solid #a855f7 !important; border-left: 1px solid #a855f7 !important; }
        .popup-quake .leaflet-popup-content { margin: 0 !important; }

        .leaflet-popup-close-button { color: #cbd5e1 !important; font-size: 16px !important; padding-top: 4px !important; padding-right: 8px !important; z-index: 50;}
        .leaflet-popup-close-button:hover { color: #ef4444 !important; background: transparent !important; }

        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 5px; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-api { animation: fadeIn 0.3s ease-out forwards; }
      `}} />

      {/* Modal สแกน QR Code */}
      {showScanModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-[#1e293b] w-[90%] max-w-[400px] rounded-2xl shadow-2xl p-8 relative flex flex-col items-center justify-center mx-auto text-center animate-fade-in-api">
            <button onClick={() => setShowScanModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold leading-none">&times;</button>
            <h2 className="text-[20px] font-bold text-white mb-2 w-full">สแกนเพื่อแจ้งจุดเสี่ยงภัย</h2>
            <p className="text-[14px] text-gray-400 mb-6 leading-relaxed w-full">พบเห็นจุดเสี่ยงภัย สามารถสแกนคิวอาร์โค้ดด้านล่างนี้เพื่อแจ้งเหตุได้ทันที</p>
            <div className="bg-white p-4 rounded-2xl shadow-inner mb-6 flex items-center justify-center">
              {qrUrl ? (
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" className="w-48 h-48 object-contain rounded-lg"/>
              ) : (
                <div className="w-48 h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm rounded-lg animate-pulse border-2 border-dashed border-gray-300">กำลังสร้าง QR Code...</div>
              )}
            </div>
            <div className="flex flex-col space-y-3 w-full mt-2">
              <a href="/report" target="_blank" rel="noopener noreferrer" className="py-3 w-full bg-gradient-to-r from-[#06b6d4] to-[#0284c7] text-white font-bold text-[15px] rounded-xl shadow-lg hover:brightness-110 transition-all flex items-center justify-center space-x-2">
                <span>เปิดหน้าฟอร์มแจ้งจุดเสี่ยงภัย</span>
              </a>
              <button onClick={() => setShowScanModal(false)} className="py-3 w-full bg-[#1e293b] text-gray-300 font-semibold text-[15px] rounded-xl hover:bg-[#334155] transition-colors">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

      {/* 🗺️ โครงสร้างแผนที่หลัก */}
      <div className="absolute inset-0 z-0 bg-[#0b132b] overflow-hidden">
        <div 
          className={`absolute pointer-events-none transition-opacity duration-700 ${windyLayer ? 'opacity-100 saturate-150' : 'opacity-0'}`}
          style={{ top: '-100vh', left: '-100vw', width: '300vw', height: '300vh', transform: `translate(${transform.x}px, ${transform.y}px)`, willChange: 'transform', zIndex: 0 }}
        >
          <iframe width="100%" height="100%" frameBorder="0" src={windyMapUrl} />
        </div>

        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>
          <MapContainer center={[14.8700, 100.9925]} zoom={6} maxZoom={20} zoomControl={false} className="w-full h-full" ref={setMapRef}>
            <ZoomControl position="topleft" />
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} />}
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} />}

            {tmdRain && villageRainData.map((station) => {
              const style = getRainCircleStyle(station.rainSum);
              return (
                <CircleMarker key={`rain-local-${station.name}`} center={[station.lat, station.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Popup className="custom-dark-popup">
                    <div className="p-5 flex flex-col text-left min-w-[240px]">
                      <div className="font-bold text-white text-[15px] mb-3 border-b border-gray-600 pb-2 flex justify-between"><span>{station.name}</span></div>
                      <div className="space-y-2 mb-2 text-[13px] text-gray-300">
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">ฝนสะสม:</span> <span className="text-[#38bdf8] font-bold text-[14px]">{station.rainSum.toFixed(1)} มม.</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">สภาพอากาศ:</span> <span>{getWmoWeatherDesc(station.wCode)}</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">อุณหภูมิ:</span> <span>{station.tempMin.toFixed(2)}°C – {station.tempMax.toFixed(2)}°C</span></div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {pm25 && nationalAirData.map((station) => (
              <Marker key={`national-pm25-${station.name}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val, station.wCode)}>
                <Popup className="custom-dark-popup">
                  <div className="px-5 py-4 text-[14px] font-bold text-white text-center">
                    จ.{station.name}<br/>
                    <span className="text-[12px] text-gray-400 font-normal mt-1 block">สภาพอากาศ: {getWmoWeatherDesc(station.wCode)}</span>
                  </div>
                </Popup>
              </Marker>
            ))}

            {hotspot && geoHotspot && geoHotspot.features && geoHotspot.features.map((feature: any, i: number) => {
              const geom = feature.geometry;
              if (!geom || geom.type !== 'Point') return null;
              const lng = geom.coordinates[0]; const lat = geom.coordinates[1];
              const props = feature.properties || {};
              const areaType = props['ประเภทของพื้นที่'] || props.AREA_TYPE || props.area_type || props.lu_desc || props.type || 'ไม่ระบุ';
              const provName = props['จังหวัด'] || props.PROV_NAM_T || props.prov_name || props.province || 'ไม่ระบุ';
              const tamName = props['ตำบล'] || props.TAM_NAM_T || props.tam_name || props.tambon || props.subdistrict || 'ไม่ระบุ';

              return (
                <Marker key={`hotspot-real-${i}`} position={[lat, lng]} icon={createHotspotIcon()}>
                  <Popup className="popup-hotspot">
                    <div className="w-[280px]">
                      <div className="bg-[#f97316] px-5 py-3 font-bold text-[#0f172a] text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">🔥</span> จุดความร้อน Hotspot
                      </div>
                      <div className="p-5 bg-[#0f172a]/95 backdrop-blur-sm">
                        <div className="text-[14px] text-gray-300 font-medium mb-4">
                          ประเภทของพื้นที่: <span className="bg-[#3b82f6] text-white px-2 py-1 rounded text-[13px] font-bold ml-1">{areaType}</span>
                        </div>
                        <div className="border-t border-[#1e293b] py-3 text-[13px] text-gray-300 leading-relaxed font-semibold">
                          จังหวัด: <span className="text-white">{provName}</span><br/>
                          ตำบล: <span className="text-white">{tamName}</span>
                        </div>
                        <div className="border-t border-[#1e293b] pt-3 text-[11px] text-gray-500 font-mono">
                          Layer: hotspot.geojson
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {earthquakeLayer && geoEarthquake && geoEarthquake.features && geoEarthquake.features.map((feature: any, i: number) => {
              const geom = feature.geometry;
              if (!geom || geom.type !== 'Point') return null;
              const lng = geom.coordinates[0]; const lat = geom.coordinates[1];
              const props = feature.properties || {};
              const areaName = props['พื้นที่'] || props.FAULT_NAME || props.fault || props.area || 'ไม่ระบุ';
              const provName = props['จังหวัด'] || props.PROV_NAM_T || props.province || 'ไม่ระบุ';
              const distName = props['อำเภอ/แนวพื้นที่'] || props.AMP_NAM_T || props.district || 'ไม่ระบุ';
              const riskLevel = props['ระดับความเสี่ยง'] || props.RISK_LEVEL || props.risk || 'ไม่ระบุ';
              const mag = props['สถานการณ์จำลอง'] || props.MAGNITUDE || props.magnitude || 'ไม่ระบุ';

              return (
                <Marker key={`quake-real-${i}`} position={[lat, lng]} icon={createQuakeIcon()}>
                  <Popup className="popup-quake">
                    <div className="w-[280px]">
                      <div className="bg-[#a855f7] px-5 py-3 font-bold text-white text-[15px] flex items-center shadow-sm">
                        <span className="mr-2 text-[18px]">〰️</span> จุดเสี่ยงแผ่นดินไหว
                      </div>
                      <div className="p-5 bg-[#0f172a]/95 backdrop-blur-sm">
                        <div className="text-[14px] text-gray-300 font-medium mb-4">
                          พื้นที่: <span className="text-[#c084fc] font-bold text-[15px] ml-1">{areaName}</span>
                        </div>
                        <div className="border-t border-[#1e293b] py-3 text-[13px] text-gray-300 leading-relaxed font-semibold">
                          จังหวัด: {provName}<br/>
                          อำเภอ/แนวพื้นที่: {distName}<br/>
                          ระดับความเสี่ยง: <span className="text-[#facc15]">{riskLevel}</span><br/>
                          สถานการณ์จำลอง: <span className="text-white">{mag}</span>
                        </div>
                        <div className="border-t border-[#1e293b] pt-3 text-[11px] text-gray-500 font-mono">
                          Layer: earthquake.geojson
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          </MapContainer>
        </div>
      </div>

      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0b132b]/95 border-b border-[#1e293b] backdrop-blur-xl z-40 flex items-center justify-between px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <div className="w-9 h-9 bg-[#38bdf8]/20 rounded-full border border-[#38bdf8]/50 flex items-center justify-center text-[12px] font-bold text-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.3)]">BL</div>
          </div>
          <div className="flex flex-col border-l-2 border-[#1e293b] pl-4 ml-2">
            <h1 className="text-[15px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศทางภูมิศาสตร์เพื่อ</h1>
            <h2 className="text-[15px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-1">การบริหารจัดการสาธารณภัย ต.บ่อหลวง</h2>
          </div>
        </div>
      </header>

      {/* แผงซ้าย ปรับให้กระชับขึ้น */}
      <aside className="absolute top-24 left-4 z-40 w-[350px] bg-[#0b132b]/95 border border-[#1e293b] rounded-2xl shadow-2xl p-5 backdrop-blur-xl pointer-events-auto max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
        <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-4">
          <div className="flex items-center space-x-3 mb-2.5">
            <div className="bg-gradient-to-br from-[#38bdf8] to-[#2563eb] p-2.5 rounded-xl shadow-[0_4px_10px_rgba(37,99,235,0.4)]">
              <span className="text-white text-[20px]">🌧️</span>
            </div>
            <h2 className="text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Weather & Air</h2>
          </div>
          <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">ชั้นข้อมูลด้านซ้ายสำหรับพยากรณ์อากาศกรมอุตุนิยมวิทยาและค่าฝุ่น PM2.5 / AQI</p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center mb-2.5">
              <span className="text-[14px] mr-2">🌦️</span>
              <span className="text-[11px] text-gray-400 tracking-widest font-bold">WEATHER API</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="space-y-1.5">
              <CustomToggleBox label="พยากรณ์อากาศกรมอุตุนิยมวิทยา" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#3b82f6" />
              <CustomToggleBox label="ปริมาณน้ำฝนสะสม (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#0ea5e9" />
            </div>
          </div>

          <div>
            <div className="flex items-center mb-2.5">
              <span className="text-[14px] mr-2">🌫️</span>
              <span className="text-[11px] text-gray-400 tracking-widest font-bold">AIR QUALITY</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div>
              <CustomToggleBox label="ค่าฝุ่น PM2.5 / AQI" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#06b6d4" />
            </div>
          </div>

          <div>
            <div className="flex items-center mb-2.5">
              <span className="text-[14px] mr-2">🗺️</span>
              <span className="text-[11px] text-gray-400 tracking-widest font-bold">WINDY WEATHER MAP</span>
              <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
            </div>
            <div className="mb-4">
              <CustomToggleBox label="เปิด/ปิดข้อมูลสภาพอากาศ Windy" active={windyLayer} onClick={() => setWindyLayer(!windyLayer)} dotColor="#facc15" />
            </div>
            {windyLayer && (
              <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 shadow-inner">
                <div className="flex items-center space-x-2 mb-3"><span className="text-[14px] font-bold text-gray-200">🌧️ ข้อมูลสภาพอากาศ Windy</span></div>
                <div className="space-y-2">
                  <CustomToggleBox label="ลม (Wind)" active={windyType === 'wind'} onClick={() => setWindyType('wind')} isRadio={true} />
                  <CustomToggleBox label="อุณหภูมิ (Temperature)" active={windyType === 'temp'} onClick={() => setWindyType('temp')} isRadio={true} />
                  <CustomToggleBox label="ฝนและฟ้าผ่า (Rain)" active={windyType === 'rain'} onClick={() => setWindyType('rain')} isRadio={true} />
                </div>
                <p className="text-[11px] text-gray-500 mt-4 leading-relaxed px-1">
                  Windy ซ้อนอยู่บนแผนที่เดียวกันกับข้อมูล GIS และซิงค์แบบ Smooth
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="absolute bottom-6 left-6 z-[60] flex items-center space-x-2 pointer-events-auto">
        <div className="bg-[#0b132b]/95 backdrop-blur-md border border-[#1e293b] rounded-full px-5 py-3 flex items-center space-x-4 shadow-[0_0_15px_rgba(0,0,0,0.5)] text-[12px] font-mono text-gray-400">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-400">Base map: Windy Weather + Dark Matter</span>
          </div>
          <div className="w-px h-4 bg-[#334155]"></div>
          <span className="font-semibold text-gray-400">CRS: WGS84</span>
          <div className="w-px h-4 bg-[#334155]"></div>
          <span ref={coordsRef} className="text-[#38bdf8] w-[145px] font-bold">14.8700° N &nbsp; 100.9925° E</span>
        </div>
      </div>

      {/* แผงขวา ปรับให้กระชับขึ้น */}
      <aside className={`absolute top-24 right-0 z-40 transition-transform duration-500 ease-in-out flex pointer-events-auto ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-[360px]'}`}>
        <div className="relative mr-5 flex">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="absolute -left-[32px] top-4 w-[32px] h-14 bg-[#0b132b]/95 border-y border-l border-[#1e293b] rounded-l-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors shadow-[-4px_0_10px_rgba(0,0,0,0.3)] backdrop-blur-md z-50 cursor-pointer">
            <svg className={`w-5 h-5 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          
          <div className="w-[360px] bg-[#0b132b]/95 border border-[#1e293b] rounded-xl shadow-2xl p-5 backdrop-blur-xl h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
            
            <div className="mb-4 flex flex-col items-start border-b border-[#1e293b] pb-4">
              <div className="flex items-center space-x-3 mb-2.5">
                <div className="bg-gradient-to-br from-[#2dd4bf] to-[#3b82f6] p-2.5 rounded-xl shadow-[0_4px_10px_rgba(45,212,191,0.3)]">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
                </div>
                <h2 className="text-[22px] font-serif font-bold tracking-wide text-[#7dd3fc]">Layers</h2>
              </div>
              <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">แผงควบคุมชั้นข้อมูลหลักด้านขวา ส่วนข้อมูลสภาพอากาศและค่าฝุ่น PM2.5 / AQI แยกไว้ด้านซ้าย</p>
              
              <div className="flex items-center space-x-3 mt-4">
                <div className="flex items-center px-4 py-1.5 rounded-full border border-[#1e293b] bg-[#0f172a]/50">
                  <div className="w-2 h-2 rounded-full bg-[#2dd4bf] mr-2 shadow-[0_0_5px_#2dd4bf]"></div>
                  <span className="text-[12px] font-bold text-gray-300 tracking-wide">Active: <span className="text-white ml-1">{activeLayersCount}</span></span>
                </div>
                <div className="flex items-center px-4 py-1.5 rounded-full border border-[#1e293b] bg-[#0f172a]/50">
                  <span className="text-[12px] font-bold text-gray-300 tracking-wide">Zoom: <span className="text-white ml-1">{currentZoom}</span></span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              
              <div>
                <div className="flex items-center mb-2.5">
                  <span className="text-[11px] text-gray-400 tracking-widest font-bold">REPORT TOOL</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div>
                  <button onClick={() => setShowScanModal(true)} className="w-full py-2.5 bg-gradient-to-r from-[#f97316] to-[#ec4899] hover:brightness-110 rounded-xl text-[15px] font-bold text-white shadow-[0_4px_15px_rgba(249,115,22,0.3)] flex items-center justify-center space-x-2 transition-all cursor-pointer">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    <span>สแกนแจ้งจุดเสี่ยง/สาธารณภัย</span>
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed px-1 text-center">
                    ระบบรวบรวมพิกัดร้องเรียนแบบแจ้งจุดเสี่ยงสาธารณภัย
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2.5">
                  <span className="text-[11px] text-[#38bdf8] tracking-widest font-bold">GIS MAP LAYERS</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1.5">
                  <CustomToggleBox label="แผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggleBox label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggleBox label="ขอบเขต 13 หมู่บ้าน (ชี้เพื่อดูชื่อ)" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                  <div className="relative">
                    <CustomToggleBox label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                    <span className="absolute right-4 top-2 text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 pointer-events-none">Admin Only</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2.5">
                  <span className="text-[11px] text-gray-400 tracking-widest font-bold">CITIZEN REPORTS</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1.5">
                  <CustomToggleBox label="จุดแจ้งเหตุประชาชน (สีแดง)" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                </div>
              </div>

              <div>
                <div className="flex items-center mb-2.5">
                  <span className="text-[11px] text-gray-400 tracking-widest font-bold">NATURAL HAZARD</span>
                  <div className="flex-1 border-t border-[#1e293b] ml-4"></div>
                </div>
                <div className="space-y-1.5">
                  <CustomToggleBox label="จุดเสี่ยงแผ่นดินไหว" active={earthquakeLayer} onClick={() => setEarthquakeLayer(!earthquakeLayer)} dotColor="#c084fc" />
                  <CustomToggleBox label="จุดความร้อน Hotspot" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#ea580c" />
                </div>
              </div>

            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
