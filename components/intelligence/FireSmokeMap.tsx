'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { NormalizedHotspot } from '@/lib/environment/gistda-hotspot';
import { hotspotAge } from '@/lib/environment/fire-smoke';

const VILLAGE_COLORS = ['#0f766e','#2563eb','#7c3aed','#a21caf','#be123c','#0369a1','#047857','#4d7c0f','#6d28d9','#0e7490','#4338ca','#15803d','#92400e'];
const villageColor = (name: string) => {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return VILLAGE_COLORS[hash % VILLAGE_COLORS.length];
};

function Focus({ feature, location }: { feature: GeoJSON.Feature | null; location: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (feature) { const bounds = L.geoJSON(feature).getBounds(); if (bounds.isValid()) map.fitBounds(bounds, { padding: [20,20], maxZoom: 14 }); } }, [feature,map]);
  useEffect(() => { if (location) map.flyTo(location, 14); }, [location,map]);
  return null;
}
export default function FireSmokeMap({ boundary, villages, points, selected, location, now }: {
  boundary: GeoJSON.FeatureCollection | null; villages: GeoJSON.FeatureCollection | null; points: NormalizedHotspot[];
  selected: GeoJSON.Feature | null; location: [number,number] | null; now: number;
}) {
  return <MapContainer center={[18.1633,98.3744]} zoom={10} style={{height:'100%',width:'100%'}} scrollWheelZoom={false}>
    <TileLayer attribution='© OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {boundary && <GeoJSON data={boundary} style={{color:'#166534',weight:3,fillOpacity:0.02}} />}
    {villages && <GeoJSON key={selected?.properties?.own_villag ?? 'all-villages'} data={villages} style={(feature)=>{ const name=typeof feature?.properties?.own_villag==='string'?feature.properties.own_villag:''; const active=selected?.properties?.own_villag===name; const color=villageColor(name); return {color:active?'#052e16':color,weight:active?4:2,fillColor:color,fillOpacity:active?0.42:0.18}; }} onEachFeature={(feature,layer)=>{ const name=feature.properties?.own_villag; if(typeof name==='string') layer.bindTooltip(name,{sticky:true,direction:'center',className:'font-bold'}); }} />}
    {points.map(p=><CircleMarker key={p.dedupeKey} center={[p.latitude,p.longitude]} radius={7} pathOptions={{color:hotspotAge(p,now)==='recent'?'#ea580c':'#64748b',fillOpacity:0.8}}><Popup><strong>จุดความร้อนจากดาวเทียม</strong><br/>{p.satellite}<br/>{p.acquiredAt ? new Date(p.acquiredAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'ไม่ทราบเวลาตรวจพบ'}<br/>ห่างศูนย์กลางบ่อหลวง {p.distanceKm} กม.<br/>ยังไม่ยืนยันว่าเป็นไฟป่า</Popup></CircleMarker>)}
    {location && <CircleMarker center={location} radius={6} pathOptions={{color:'#2563eb'}}><Popup>ตำแหน่งของคุณ</Popup></CircleMarker>}
    <Focus feature={selected || (boundary?.features[0] ?? null)} location={location} />
  </MapContainer>;
}
