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

// 💎 UI Component สำหรับสวิตช์เปิดปิด
const CustomToggle = ({ label, active, onClick, dotColor = '#38bdf8' }: any) => (
  <div className="flex items-center space-x-3 cursor-pointer group py-1.5" onClick={onClick}>
    <div className={`relative w-[34px] h-[18px] rounded-full transition-colors duration-300 flex-shrink-0 ${active ? 'bg-[#38bdf8]' : 'bg-[#334155]'}`}>
      <div className={`absolute top-[2px] left-[2px] bg-white rounded-full h-[14px] w-[14px] transition-transform duration-300 shadow-sm ${active ? 'translate-x-[16px]' : 'translate-x-0'}`}></div>
    </div>
    <div className="flex items-center space-x-2 flex-1">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? dotColor : '#475569' }}></div>
      <span className={`text-[12px] font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{label}</span>
    </div>
  </div>
);

// 🌤️ แปลงรหัสสภาพอากาศ WMO เป็นภาษาไทยและ Emoji
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

// 📍 พิกัดสถานีระดับประเทศ 
const nationalStations = [
  { name: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 }, { name: 'เชียงราย', lat: 19.9070, lng: 99.8325 },
  { name: 'แม่ฮ่องสอน', lat: 19.3020, lng: 97.9654 }, { name: 'น่าน', lat: 18.7756, lng: 100.7730 },
  { name: 'ตาก', lat: 16.8839, lng: 99.1258 }, { name: 'พิษณุโลก', lat: 16.8211, lng: 100.2659 },
  { name: 'ขอนแก่น', lat: 16.4322, lng: 102.8236 }, { name: 'อุดรธานี', lat: 17.4138, lng: 102.7872 },
  { name: 'อุบลราชธานี', lat: 15.2448, lng: 104.8473 }, { name: 'นครราชสีมา', lat: 14.9799, lng: 102.0978 },
  { name: 'เลย', lat: 17.4860, lng: 101.7223 }, { name: 'สกลนคร', lat: 17.1664, lng: 104.1486 },
  { name: 'กรุงเทพฯ', lat: 13.7563, lng: 100.5018 }, { name: 'กาญจนบุรี', lat: 14.0041, lng: 99.5316 },
  { name: 'ชลบุรี', lat: 13.3611, lng: 100.9847 }, { name: 'ระยอง', lat: 12.6814, lng: 101.2816 },
  { name: 'ประจวบคีรีขันธ์', lat: 11.8124, lng: 99.7975 }, { name: 'ชุมพร', lat: 10.4930, lng: 99.1800 },
  { name: 'สุราษฎร์ธานี', lat: 9.1332, lng: 99.3195 }, { name: 'ภูเก็ต', lat: 7.8804, lng: 98.3922 },
  { name: 'สงขลา', lat: 7.1898, lng: 100.5954 }, { name: 'ยะลา', lat: 6.5411, lng: 101.2816 }
];

export default function BoLuangDashboard() {
  const [mounted, setMounted] = useState(false);

  // 🎛️ State แผงควบคุม
  const [tmdWeather, setTmdWeather] = useState(true);
  const [tmdRain, setTmdRain] = useState(true);
  const [pm25, setPm25] = useState(true);
  const [windyLayer, setWindyLayer] = useState(true); 
  const [windyType, setWindyType] = useState('rain'); 
  
  const [satelliteLayer, setSatelliteLayer] = useState(false); 
  const [showBoluang, setShowBoluang] = useState(true);   
  const [showBlock, setShowBlock] = useState(true);        
  const [showParcel, setShowParcel] = useState(true);      
  const [landslide, setLandslide] = useState(true);        
  const [citizenReport, setCitizenReport] = useState(false);
  const [hotspot, setHotspot] = useState(true);
  
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  
  // 🌟 State สำหรับเปิด Modal สแกน QR Code แจ้งจุดเสี่ยง
  const [showScanModal, setShowScanModal] = useState(false);

  const [apiLoadingConfig, setApiLoadingConfig] = useState<{isOpen: boolean, title: string, desc: string, icon: string}>({ isOpen: false, title: '', desc: '', icon: '' });

  // 📡 ข้อมูล API & GeoJSON
  const [realWeatherData, setRealWeatherData] = useState<any>(null);
  const [villageRainData, setVillageRainData] = useState<any[]>([]); 
  const [nationalAirData, setNationalAirData] = useState<any[]>([]);
  
  const [geoBoluang, setGeoBoluang] = useState<any>(null);
  const [geoBlock, setGeoBlock] = useState<any>(null);
  const [geoParcel, setGeoParcel] = useState<any>(null);
  const [geoLandslideRisk, setGeoLandslideRisk] = useState<any>(null);

  const [mapRef, setMapRef] = useState<any>(null);
  const [iframeState, setIframeState] = useState({ lat: 18.1633, lng: 98.3744, zoom: 12 });
  const [transform, setTransform] = useState({ x: 0, y: 0 });
  const syncData = useRef({ lat: 18.1633, lng: 98.3744, zoom: 12 });

  useEffect(() => {
    setMounted(true);
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
    loadGeoJSON(`/geojson/boluang_landslide_risk.json?v=${ts}`, setGeoLandslideRisk);
  }, []);

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
    if (!tmdRain) { setVillageRainData([]); return; }
    if (!villageLabels || villageLabels.length === 0) return;

    const fetchVillageRain = async () => {
      setApiLoadingConfig({ isOpen: true, title: 'กำลังโหลดปริมาณฝน', desc: 'กำลังโหลดข้อมูลปริมาณฝนสะสมจากกรมอุตุนิยมวิทยา...', icon: '🌧️' });
      try {
        const lats = villageLabels.map(v => v.lat.toFixed(4)).join(',');
        const lngs = villageLabels.map(v => v.lng.toFixed(4)).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`;
        await new Promise(resolve => setTimeout(resolve, 1500));
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
      } catch (error) { console.error(error); } finally { setApiLoadingConfig(prev => ({ ...prev, isOpen: false })); }
    };
    fetchVillageRain();
  }, [tmdRain, villageLabels]);

  useEffect(() => {
    if (!pm25) { setNationalAirData([]); return; }
    const fetchNationalAir = async () => {
      setApiLoadingConfig({ isOpen: true, title: 'กำลังโหลดคุณภาพอากาศ', desc: 'กำลังโหลดข้อมูลฝุ่น PM2.5 และสภาพอากาศระดับประเทศ (AQI)...', icon: '😷' });
      try {
        const lats = nationalStations.map(s => s.lat.toFixed(4)).join(',');
        const lngs = nationalStations.map(s => s.lng.toFixed(4)).join(',');
        await new Promise(resolve => setTimeout(resolve, 1500));
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
      } catch (error) { console.error(error); } finally { setApiLoadingConfig(prev => ({ ...prev, isOpen: false })); }
    };
    fetchNationalAir();
  }, [pm25]);

  const getRainCircleStyle = (rainSum: number) => {
    let radius = 8 + (rainSum * 1.5); 
    if (radius > 35) radius = 35; 
    let color = '#38bdf8'; let fillColor = '#7dd3fc'; 
    if (rainSum === 0) { color = '#94a3b8'; fillColor = '#cbd5e1'; radius = 7; } 
    else if (rainSum > 5 && rainSum <= 20) { color = '#10b981'; fillColor = '#34d399'; } 
    else if (rainSum > 20 && rainSum <= 50) { color = '#eab308'; fillColor = '#facc15'; } 
    else if (rainSum > 50) { color = '#ef4444'; fillColor = '#f87171'; }
    return { radius, color, fillColor, fillOpacity: 0.7, weight: 2.5 };
  };

  const styleBoluang = { color: '#0ea5e9', weight: 3, fillOpacity: 0, interactive: false }; 
  const BLOCK_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e', '#14b8a6', '#0ea5e9'];
  
  const getBlockStyle = (feature: any) => {
    const props = feature?.properties || {};
    const name = props.own_villag || props.name_th || props.name || props.id || "0";
    const colorIndex = String(name).length % BLOCK_COLORS.length;
    return { fillColor: props.fill || BLOCK_COLORS[colorIndex], weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' };
  };

  const onEachBlockFeature = (feature: any, layer: any) => {
    const props = feature?.properties || {};
    const rawName = props.own_villag || props.name_th || props.name || props.zone_name || `หมู่ที่ ${props.zone_id || props.id || ''}`;
    const villageName = formatVillageName(rawName);
    const colorIndex = String(rawName).length % BLOCK_COLORS.length;
    const defaultColor = props.fill || BLOCK_COLORS[colorIndex];

    layer.bindTooltip(villageName, { sticky: true, direction: 'auto', className: 'village-hover-tooltip' });
    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 3, color: '#ffffff', fillColor: defaultColor, fillOpacity: 0.6, dashArray: '' });
        targetLayer.bringToFront(); 
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 1.5, color: 'rgba(255, 255, 255, 0.3)', fillOpacity: 0.12, dashArray: '3, 3' });
      }
    });
  };

  const findVillageByLatLng = (lat: number, lng: number, blockData: any) => {
    if (!blockData || !blockData.features) return 'ต.บ่อหลวง (นอกเขตหมู่บ้าน)';
    const pt = [lng, lat]; 
    const isPointInPolygon = (point: number[], vs: any[]) => {
      let x = point[0], y = point[1];
      let inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    for (const feature of blockData.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      let isInside = false;
      if (geom.type === 'Polygon') {
        isInside = isPointInPolygon(pt, geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        for (let i = 0; i < geom.coordinates.length; i++) {
          if (isPointInPolygon(pt, geom.coordinates[i][0])) { isInside = true; break; }
        }
      }
      if (isInside) {
        const props = feature.properties || {};
        const rawName = props.own_villag || props.name_th || props.name || props.zone_name || '';
        return formatVillageName(rawName);
      }
    }
    return 'ต.บ่อหลวง (นอกเขตหมู่บ้าน)';
  };

  const styleLandslide = (feature: any) => ({ color: feature.properties?.class === 1 ? '#ef4444' : '#f97316', fillColor: feature.properties?.class === 1 ? '#ef4444' : '#f97316', weight: 1.5, fillOpacity: 0.5, interactive: true });
  
  const onEachLandslideFeature = (feature: any, layer: any) => {
    layer.bindTooltip('กำลังคำนวณพื้นที่...', { sticky: true, direction: 'auto', className: 'custom-map-tooltip' });
    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 2.5, fillOpacity: 0.8 });
        targetLayer.bringToFront(); 
        const center = targetLayer.getBounds().getCenter();
        const detectedVillage = findVillageByLatLng(center.lat, center.lng, geoBlock);
        const props = feature.properties || {};
        const riskClass = props.class || '-';
        const riskLevel = props.ls_desth || props.LS_DESTH || 'ไม่ระบุ';

        targetLayer.setTooltipContent(`
          <div class="px-4 py-3 text-[12px] text-[#0f172a] bg-white/95 border-2 border-[#ea580c] rounded-xl shadow-xl font-sans min-w-[200px]">
            <div class="font-bold text-[14px] text-[#ea580c] mb-2 border-b border-gray-200 pb-1.5 flex items-center">
              <span class="mr-1.5">⚠️</span> พื้นที่เสี่ยงดินถล่ม
            </div>
            <div class="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 mt-2">
              <span class="text-gray-500 font-semibold">พื้นที่:</span> <span class="font-bold text-gray-800">${detectedVillage}</span>
              <span class="text-gray-500 font-semibold">ระดับ (Class):</span> <span class="font-bold text-red-600">${riskClass}</span>
              <span class="text-gray-500 font-semibold">ความเสี่ยง:</span> <span class="font-bold text-[#ea580c]">${riskLevel}</span>
            </div>
          </div>
        `);
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 1.5, fillOpacity: 0.5 });
      }
    });
  };

  const styleParcel = { color: '#4ade80', fillColor: '#4ade80', weight: 1, fillOpacity: 0.2 }; 
  
  const onEachParcelFeature = (feature: any, layer: any) => {
    const props = feature?.properties || {};
    const parcelCode = props.parcel_cod || props.id || props.PARCEL_NO || '-';
    const ownerName = props.owner || (props.own_fname ? `${props.own_fname} ${props.own_lname || ''}` : 'ไม่ระบุชื่อ');
    const village = props.own_villag || 'ไม่ระบุ';
    const landType = props.land_type || '-';

    layer.bindTooltip(`
      <div class="px-4 py-3 text-[12px] text-[#0f172a] bg-white/95 border-2 border-[#10b981] rounded-xl shadow-xl font-sans min-w-[200px]">
        <div class="font-bold text-[14px] text-[#10b981] mb-2 border-b border-gray-200 pb-1.5 flex items-center">
          <span class="mr-1.5">📄</span> รหัสแปลง: ${parcelCode}
        </div>
        <div class="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1.5 mt-2">
          <span class="text-gray-500 font-semibold">เจ้าของ:</span> <span class="font-bold text-gray-800">${ownerName}</span>
          <span class="text-gray-500 font-semibold">หมู่บ้าน:</span> <span class="text-gray-700">${village}</span>
          <span class="text-gray-500 font-semibold">ประเภท:</span> <span class="text-gray-700">${landType}</span>
        </div>
      </div>
    `, { sticky: true, direction: 'auto', className: 'custom-map-tooltip' });

    layer.on({
      mouseover: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 2.5, color: '#10b981', fillColor: '#34d399', fillOpacity: 0.7 });
        targetLayer.bringToFront(); 
      },
      mouseout: (e: any) => {
        const targetLayer = e.target;
        targetLayer.setStyle({ weight: 1, color: '#4ade80', fillColor: '#4ade80', fillOpacity: 0.2 });
      }
    });
  };

  useEffect(() => {
    if (!mapRef) return;
    const onMove = () => {
      const zoom = mapRef.getZoom();
      if (zoom !== syncData.current.zoom) return;
      const initialPoint = mapRef.project(syncData.current, zoom);
      const currentPoint = mapRef.project(mapRef.getCenter(), zoom);
      setTransform({ x: initialPoint.x - currentPoint.x, y: initialPoint.y - currentPoint.y });
      setIframeState(prev => ({ ...prev, lat: mapRef.getCenter().lat, lng: mapRef.getCenter().lng })); 
    };
    const onZoomEnd = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setTransform({ x: 0, y: 0 });
    };
    const onMoveEnd = () => {
      const center = mapRef.getCenter(); const zoom = mapRef.getZoom();
      syncData.current = { lat: center.lat, lng: center.lng, zoom: zoom };
      setIframeState({ lat: center.lat, lng: center.lng, zoom: zoom });
      setTransform({ x: 0, y: 0 });
    };
    mapRef.on('move', onMove); mapRef.on('moveend', onMoveEnd); mapRef.on('zoomend', onZoomEnd);
    return () => { mapRef.off('move', onMove); mapRef.off('moveend', onMoveEnd); mapRef.off('zoomend', onZoomEnd); };
  }, [mapRef]);

  const windyMapUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=${iframeState.zoom}&overlay=${windyType}&product=ecmwf&level=surface&lat=${iframeState.lat}&lon=${iframeState.lng}&detailLat=${iframeState.lat}&detailLon=${iframeState.lng}&marker=false`;

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  
  const createPm25Icon = useMemo(() => {
    if (!L) return () => null;
    return (pmVal: number, wCode: number) => {
      const emoji = getWeatherEmoji(wCode);
      const html = `
        <div class="relative flex flex-col items-center justify-center w-[48px] h-[40px] bg-[#0f172a]/95 border-[1.5px] border-[#334155] rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <div class="absolute -top-[14px] -left-[14px] w-7 h-7 bg-[#1e293b] rounded-full border border-[#475569] flex items-center justify-center text-[13px] shadow-lg z-10">${emoji}</div>
          <span class="text-white font-bold text-[14px] leading-none mt-1.5 z-0">${pmVal.toFixed(1)}</span>
          <span class="text-[#38bdf8] text-[9px] font-bold mt-1 z-0 tracking-wider">PM2.5</span>
        </div>
      `;
      return L.divIcon({ className: 'bg-transparent border-none', html, iconSize: [48, 40], iconAnchor: [24, 20] });
    };
  }, [L]);

  const weatherIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: 'bg-transparent border-none',
      html: `<div class="flex items-center justify-center w-12 h-12 bg-black/80 border-[1.5px] border-[#38bdf8] rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] backdrop-blur-md cursor-pointer hover:scale-110 transition-transform z-50"><span class="text-[20px]">${realWeatherData?.precipitation > 0 ? '🌧️' : '🌤️'}</span></div>`,
      iconSize: [48, 48], iconAnchor: [24, 24]
    });
  }, [realWeatherData, L]);

  return (
    <main className="relative w-screen h-screen bg-[#111827] font-sans text-white overflow-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container { background: transparent !important; }
        .leaflet-top.leaflet-left { top: 90px !important; left: 360px !important; }
        .leaflet-bar a { background-color: #0f172a !important; color: #fff !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .leaflet-bar a:hover { background-color: #1e293b !important; }
        .leaflet-div-icon { background: transparent !important; border: none !important; }
        
        .leaflet-tooltip.village-hover-tooltip { 
          background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; 
          font-family: inherit !important; font-size: 13px !important; font-weight: 600 !important; 
          padding: 5px 12px !important; border-radius: 6px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15) !important; 
        }

        .leaflet-tooltip.custom-map-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }

        .leaflet-tooltip.custom-dark-tooltip {
          background-color: rgba(15, 23, 42, 0.95) !important;
          color: #e2e8f0 !important;
          border: 1px solid #1e293b !important;
          font-family: inherit !important;
          padding: 14px 16px !important;
          border-radius: 10px !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
          backdrop-filter: blur(4px) !important;
        }
        .leaflet-tooltip.custom-dark-tooltip::before { border-top-color: rgba(15, 23, 42, 0.95) !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fade-in-api { animation: fadeIn 0.3s ease-out forwards; }
      `}} />

      {/* 🌟 Modal สแกน QR Code สำหรับแจ้งจุดเสี่ยงภัย (ปรับให้อยู่กึ่งกลางเป๊ะ) */}
      {showScanModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in-api">
          <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 flex flex-col items-center relative">
            <button onClick={() => setShowScanModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold">×</button>
            <h2 className="text-[18px] font-bold text-white mb-2 text-center w-full">สแกนเพื่อแจ้งจุดเสี่ยงภัย</h2>
            <p className="text-[12px] text-gray-400 mb-6 leading-relaxed text-center w-full">
              พบเห็นจุดเสี่ยงภัย ไฟป่า ดินถล่ม หรือสาธารณภัยในพื้นที่ สามารถสแกนคิวอาร์โค้ดด้านล่างนี้เพื่อระบุพิกัดและแจ้งเหตุได้ทันที
            </p>
            
            {/* 🌟 บังคับกึ่งกลาง 100% ด้วย flex justify-center และ w-full */}
            <div className="flex justify-center w-full mb-6">
              <div className="bg-white p-4 rounded-xl shadow-inner inline-block">
                {/* ตัวอย่างจำลอง QR Code */}
                <div className="w-48 h-48 bg-gray-900 flex items-center justify-center text-white text-xs rounded-lg p-2 text-center mx-auto">
                  [ QR CODE สำหรับสแกนฟอร์มรายงาน ]
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-3 w-full">
              <a 
                href="/report" 
                target="_blank" 
                rel="noopener noreferrer"
                className="py-3 w-full bg-gradient-to-r from-[#38bdf8] to-[#0284c7] text-[#0f172a] font-bold text-[13px] rounded-xl shadow-lg hover:brightness-110 transition-all flex items-center justify-center space-x-2"
              >
                <span>เปิดหน้าฟอร์มแจ้งจุดเสี่ยงภัย</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <button 
                onClick={() => setShowScanModal(false)}
                className="py-2.5 w-full bg-[#1e293b] text-gray-300 font-semibold text-[13px] rounded-xl hover:bg-[#334155] transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {apiLoadingConfig.isOpen && (
        <div className="absolute top-[25%] left-[50%] z-[9999] w-[360px] shadow-2xl rounded-xl overflow-hidden animate-fade-in-api border border-[#1e293b]">
          <div className="bg-[#38bdf8] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-[#0f172a] font-bold text-[13px]">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{apiLoadingConfig.icon} {apiLoadingConfig.title}</span>
            </div>
            <button onClick={() => setApiLoadingConfig(prev => ({...prev, isOpen: false}))} className="text-[#0f172a]/70 hover:text-[#0f172a] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="bg-[#0f172a]/95 backdrop-blur-xl p-5">
            <p className="font-bold text-white text-[14px] mb-3">เป้าหมาย: ตรวจสอบข้อมูลระดับชาติ/ภูมิภาค</p>
            <p className="text-gray-300 text-[13px] leading-relaxed mb-4">
              {apiLoadingConfig.desc}
            </p>
            <div className="pt-3 border-t border-gray-700/60 flex items-center justify-between">
              <p className="text-[10px] text-gray-500 font-mono tracking-wide">
                เชื่อมต่อ Open-Meteo API (Real-time)
              </p>
              <span className="text-[10px] text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 rounded border border-[#38bdf8]/20 animate-pulse">Syncing...</span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-0 bg-[#0b1120] overflow-hidden">
        <div 
          className={`absolute pointer-events-none transition-opacity duration-700 ${windyLayer ? 'opacity-100 saturate-150' : 'opacity-0'}`}
          style={{ top: '-100vh', left: '-100vw', width: '300vw', height: '300vh', transform: `translate(${transform.x}px, ${transform.y}px)`, willChange: 'transform', zIndex: 0 }}
        >
          <iframe width="100%" height="100%" frameBorder="0" src={windyMapUrl} />
        </div>

        <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 10 }}>
          <MapContainer center={[18.1633, 98.3744]} zoom={12} maxZoom={20} zoomControl={false} className="w-full h-full" ref={setMapRef}>
            <ZoomControl position="topleft" />
            {!windyLayer && !satelliteLayer && <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={20} />}
            {!windyLayer && satelliteLayer && <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={20} />}
            
            {showBoluang && geoBoluang && <GeoJSON key="boluang-layer" data={geoBoluang} style={styleBoluang} />}
            {showBlock && geoBlock && <GeoJSON key="block-layer" data={geoBlock} style={getBlockStyle} onEachFeature={onEachBlockFeature} />}
            {landslide && geoLandslideRisk && <GeoJSON key="landslide-layer" data={geoLandslideRisk} style={styleLandslide} onEachFeature={onEachLandslideFeature} />}
            {showParcel && geoParcel && <GeoJSON key="parcel-layer" data={geoParcel} style={styleParcel} onEachFeature={onEachParcelFeature} />}

            {tmdRain && villageRainData.map((station, index) => {
              const style = getRainCircleStyle(station.rainSum);
              return (
                <CircleMarker key={`rain-local-${index}`} center={[station.lat, station.lng]} radius={style.radius} pathOptions={{ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight }}>
                  <Tooltip direction="top" offset={[0, -10]} className="custom-dark-tooltip" sticky>
                    <div className="flex flex-col text-left min-w-[220px]">
                      <div className="font-bold text-white text-[14px] mb-3 border-b border-gray-600 pb-2 flex justify-between"><span>{station.name}</span></div>
                      <div className="space-y-1.5 mb-4 text-[12px] text-gray-300">
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">ฝนสะสม:</span> <span className="text-[#38bdf8] font-bold text-[13px]">{station.rainSum.toFixed(1)} มม.</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">สภาพอากาศ:</span> <span>{getWmoWeatherDesc(station.wCode)}</span></div>
                        <div className="flex items-center"><span className="font-semibold text-gray-400 w-24">อุณหภูมิ:</span> <span>{station.tempMin.toFixed(2)}°C – {station.tempMax.toFixed(2)}°C</span></div>
                      </div>
                      <div className="text-[10px] text-gray-500 pt-2.5 border-t border-gray-700 leading-relaxed tracking-wide">ข้อมูลจาก API • {station.apiDate}T00:00:00+07:00</div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {pm25 && nationalAirData.map((station, index) => (
              <Marker key={`national-pm25-${index}`} position={[station.lat, station.lng]} icon={createPm25Icon(station.pm25Val, station.wCode)}>
                <Tooltip direction="top" offset={[0, -20]} className="custom-dark-tooltip" sticky>
                  <div className="text-[13px] font-bold text-white text-center px-2 py-1">
                    จ.{station.name}<br/>
                    <span className="text-[11px] text-gray-400 font-normal">สภาพอากาศ: {getWmoWeatherDesc(station.wCode)}</span>
                  </div>
                </Tooltip>
              </Marker>
            ))}

            {mounted && tmdWeather && weatherIcon && <Marker position={[18.1633, 98.3744]} icon={weatherIcon} eventHandlers={{ click: () => setShowWeatherPopup(true) }} />}
          </MapContainer>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a]/10 to-[#064e3b]/10 mix-blend-screen pointer-events-none z-[15]" />
      </div>

      <header className="absolute top-0 left-0 right-0 h-[72px] bg-[#0c1427]/95 border-b border-[#1e293b] backdrop-blur-xl z-40 flex items-center justify-between px-6 pointer-events-auto shadow-md">
        <div className="flex items-center space-x-4">
          <div className="flex space-x-2">
            <div className="w-8 h-8 bg-red-500/20 rounded-full border border-red-500/50 flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]">BL</div>
          </div>
          <div className="flex flex-col border-l-2 border-gray-600/50 pl-4 ml-2">
            <h1 className="text-[14px] font-bold tracking-wide text-white leading-tight">ระบบสารสนเทศทางภูมิศาสตร์เพื่อ</h1>
            <h2 className="text-[14px] font-bold tracking-wide text-[#38bdf8] leading-tight mt-0.5">การบริหารจัดการสาธารณภัย ต.บ่อหลวง</h2>
          </div>
        </div>
      </header>

      <aside className="absolute top-24 left-4 z-40 w-[340px] bg-[#0c1427]/95 border border-[#1e293b] rounded-2xl shadow-2xl p-6 backdrop-blur-xl pointer-events-auto">
        <div className="flex items-center space-x-3 mb-2">
          <div className="bg-[#56b6c2] p-2 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.5 19C19.9853 19 22 16.9853 22 14.5C22 12.1384 20.1837 10.2017 17.8778 10.0153C17.4419 6.62141 14.5492 4 11 4C7.13401 4 4 7.13401 4 11C4 11.238 4.01188 11.4732 4.0349 11.7047C1.7828 12.1812 0 14.1378 0 16.5C0 19.5 2.5 22 5.5 22H17.5V19Z" /></svg>
          </div>
          <h2 className="text-[18px] font-bold tracking-wide text-[#56b6c2]">Weather & Air</h2>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed mb-6">ชั้นข้อมูลด้านซ้ายสำหรับพยากรณ์อากาศกรมอุตุนิยมวิทยา<br/>และค่าฝุ่น PM2.5 / AQI</p>

        <div className="space-y-6">
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">☁</span> WEATHER API</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="space-y-4 pl-1">
              <CustomToggle label="พยากรณ์อากาศกรมอุตุนิยมวิทยา" active={tmdWeather} onClick={() => setTmdWeather(!tmdWeather)} dotColor="#3b82f6" />
              <CustomToggle label="ปริมาณน้ำฝนสะสม (TMD)" active={tmdRain} onClick={() => setTmdRain(!tmdRain)} dotColor="#06b6d4" />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">≈</span> AIR QUALITY</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="pl-1">
              <CustomToggle label="ค่าฝุ่น PM2.5 / AQI (ระดับประเทศ)" active={pm25} onClick={() => setPm25(!pm25)} dotColor="#0ea5e9" />
            </div>
          </div>
          <div>
            <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-gray-400 tracking-widest font-semibold"><span className="mr-2">🗺️</span> WINDY WEATHER MAP</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
            <div className="pl-1 mb-4">
              <CustomToggle label="เปิด/ปิดข้อมูลสภาพอากาศ Windy" active={windyLayer} onClick={() => setWindyLayer(!windyLayer)} dotColor="#eab308" />
            </div>
            {windyLayer && (
              <div className="bg-[#0f172a] rounded-xl border border-[#1e293b] p-4 mx-1">
                <div className="flex items-center space-x-2 mb-3"><span className="text-[14px]">🌧️</span><span className="text-[12px] font-bold text-white">ข้อมูลสภาพอากาศ Windy</span></div>
                <div className="space-y-2">
                  <div onClick={() => setWindyType('wind')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'wind' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'wind' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'wind' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'wind' ? 'text-white' : 'text-gray-300'}`}>ลม (Wind)</span>
                  </div>
                  <div onClick={() => setWindyType('temp')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'temp' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'temp' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'temp' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'temp' ? 'text-white' : 'text-gray-300'}`}>อุณหภูมิ (Temperature)</span>
                  </div>
                  <div onClick={() => setWindyType('rain')} className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-colors select-none ${windyType === 'rain' ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10' : 'border-gray-700/40 hover:bg-white/5'}`}>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${windyType === 'rain' ? 'border-[#38bdf8]' : 'border-gray-400'}`}>{windyType === 'rain' && <div className="w-2 h-2 bg-[#38bdf8] rounded-full"></div>}</div>
                    <span className={`text-[12px] ${windyType === 'rain' ? 'text-white' : 'text-gray-300'}`}>ฝนและฟ้าผ่า (Rain)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <aside className={`absolute top-24 right-0 z-40 transition-transform duration-500 ease-in-out flex pointer-events-auto ${isRightPanelOpen ? 'translate-x-0' : 'translate-x-[320px]'}`}>
        <div className="relative mr-4 flex">
          <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className="absolute -left-[30px] top-4 w-[30px] h-12 bg-[#0c1427]/95 border-y border-l border-[#1e293b] rounded-l-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e293b] transition-colors shadow-[-4px_0_10px_rgba(0,0,0,0.3)] backdrop-blur-md z-50 cursor-pointer">
            <svg className={`w-4 h-4 transform transition-transform duration-300 ${isRightPanelOpen ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="w-[320px] bg-[#0c1427]/95 border border-[#1e293b] rounded-xl shadow-2xl p-5 backdrop-blur-xl h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
            <div className="flex items-start space-x-3 mb-3">
              <div className="mt-1 text-[#56b6c2]"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" /></svg></div>
              <div className="w-full">
                <h2 className="text-[16px] font-semibold tracking-wide text-white">Layers</h2>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">เปิด/ปิด ขอบเขตความรับผิดชอบและชั้นข้อมูลระดับเทศบาล</p>
              </div>
            </div>
            <div className="space-y-5 mt-6">
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-[#38bdf8] tracking-widest font-semibold"><span className="mr-2">🗺️</span> GIS MAP LAYERS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="space-y-3 pl-1">
                  <CustomToggle label="แผนที่ดาวเทียม (Satellite)" active={satelliteLayer} onClick={() => setSatelliteLayer(!satelliteLayer)} dotColor="#10b981" />
                  <CustomToggle label="ขอบเขตตำบลบ่อหลวง" active={showBoluang} onClick={() => setShowBoluang(!showBoluang)} dotColor="#38bdf8" />
                  <CustomToggle label="ขอบเขต 13 หมู่บ้าน (ชี้เพื่อดูชื่อ)" active={showBlock} onClick={() => setShowBlock(!showBlock)} dotColor="#fcd34d" />
                </div>
              </div>
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-green-400 tracking-widest font-semibold"><span className="mr-2">🔒</span> LAND RECORDS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="flex items-center justify-between pl-1">
                  <CustomToggle label="แปลงที่ดินรายบุคคล" active={showParcel} onClick={() => setShowParcel(!showParcel)} dotColor="#4ade80" />
                  <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30">Admin Only</span>
                </div>
              </div>
              <div>
                <div className="flex items-center mb-3"><div className="flex items-center text-[10px] text-[#fb923c] tracking-widest font-semibold"><span className="mr-2 text-transparent">v</span> REPORT TOOL</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="px-1">
                  <button 
                    onClick={() => setShowScanModal(true)}
                    className="w-full py-2.5 bg-gradient-to-r from-[#fb923c] to-[#f97316] hover:from-[#f97316] hover:to-[#ea580c] rounded-lg text-[13px] font-medium text-white shadow-[0_4px_15px_rgba(249,115,22,0.3)] flex items-center justify-center space-x-2 transition-all active:scale-95 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span>สแกนแจ้งจุดเสี่ยงภัย/สาธารณภัย</span>
                  </button>
                </div>
              </div>
              <div>
                <div className="flex items-center mb-4"><div className="flex items-center text-[10px] text-[#f97316] tracking-widest font-semibold"><span className="mr-2">🚨</span> HAZARD & REPORTS</div><div className="flex-1 border-t border-gray-700/60 ml-3"></div></div>
                <div className="space-y-4 pl-1">
                  <CustomToggle label="จุดแจ้งเหตุประชาชน (สีแดง)" active={citizenReport} onClick={() => setCitizenReport(!citizenReport)} dotColor="#ef4444" />
                  <CustomToggle label="จุดเสี่ยงดินถล่ม (ชี้เพื่อดูระดับ)" active={landslide} onClick={() => setLandslide(!landslide)} dotColor="#eab308" />
                  <CustomToggle label="จุดความร้อน Hotspot (สีส้ม)" active={hotspot} onClick={() => setHotspot(!hotspot)} dotColor="#f97316" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
