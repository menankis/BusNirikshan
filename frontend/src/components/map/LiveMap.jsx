import { useEffect, useRef, useMemo } from 'react';
import styles from './LiveMap.module.css';

// Leaflet is loaded via CDN script tag in index.html
// We reference window.L here

export function LiveMap({ busLocations, stops, userPosition, selectedBus, onBusClick }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef({});
  const stopMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);

  // Init map
  useEffect(() => {
    if (mapInstance.current || !window.L) return;

    mapInstance.current = window.L.map(mapRef.current, {
      center: [23.0225, 72.5714], // Ahmedabad default
      zoom: 13,
      zoomControl: false,
    });

    window.L.control.zoom({ position: 'bottomright' }).addTo(mapInstance.current);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // Bus markers
  useEffect(() => {
    if (!mapInstance.current || !window.L) return;
    const L = window.L;

    Object.entries(busLocations).forEach(([busId, loc]) => {
      const isSelected = selectedBus === busId;
      const icon = L.divIcon({
        className: '',
        html: `<div class="bus-marker${isSelected ? ' selected' : ''}">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="${isSelected ? '#06D6A0' : '#FF6B2C'}"/>
            <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z" fill="white" fill-opacity="0.95"/>
            <rect x="7" y="20" width="18" height="4" rx="1" fill="white" fill-opacity="0.8"/>
            <circle cx="11" cy="24" r="2" fill="${isSelected ? '#06D6A0' : '#FF6B2C'}"/>
            <circle cx="21" cy="24" r="2" fill="${isSelected ? '#06D6A0' : '#FF6B2C'}"/>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (markersRef.current[busId]) {
        markersRef.current[busId].setLatLng([loc.latitude, loc.longitude]);
        markersRef.current[busId].setIcon(icon);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon })
          .addTo(mapInstance.current)
          .on('click', () => onBusClick && onBusClick(busId));
        markersRef.current[busId] = marker;
      }
    });

    // Remove stale markers
    Object.keys(markersRef.current).forEach(id => {
      if (!busLocations[id]) {
        mapInstance.current.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
  }, [busLocations, selectedBus, onBusClick]);

  // Stop markers
  useEffect(() => {
    if (!mapInstance.current || !window.L || !stops?.length) return;
    const L = window.L;

    stopMarkersRef.current.forEach(m => mapInstance.current.removeLayer(m));
    stopMarkersRef.current = [];

    stops.forEach(stop => {
      const lat = stop.location?.coordinates?.[1] ?? stop.latitude;
      const lng = stop.location?.coordinates?.[0] ?? stop.longitude;
      if (!lat || !lng) return;

      const icon = L.divIcon({
        className: '',
        html: `<div class="stop-marker"><div class="stop-dot"></div></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const m = L.marker([lat, lng], { icon })
        .addTo(mapInstance.current)
        .bindPopup(`<b>${stop.name}</b><br/>${stop.city}`);
      stopMarkersRef.current.push(m);
    });
  }, [stops]);

  // User position marker
  useEffect(() => {
    if (!mapInstance.current || !window.L || !userPosition) return;
    const L = window.L;

    const icon = L.divIcon({
      className: '',
      html: `<div class="user-marker"><div class="user-pulse"></div><div class="user-dot"></div></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPosition.latitude, userPosition.longitude]);
    } else {
      userMarkerRef.current = L.marker([userPosition.latitude, userPosition.longitude], { icon })
        .addTo(mapInstance.current);
      mapInstance.current.setView([userPosition.latitude, userPosition.longitude], 14);
    }
  }, [userPosition]);

  return (
    <div className={styles.mapWrap}>
      <div ref={mapRef} className={styles.map} />
      <style>{`
        .bus-marker { cursor: pointer; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)); transition: transform 0.2s; }
        .bus-marker.selected { transform: scale(1.25); }
        .stop-marker { display: flex; align-items: center; justify-content: center; }
        .stop-dot { width: 10px; height: 10px; border-radius: 50%; background: #FFD166; border: 2px solid rgba(255,255,255,0.8); box-shadow: 0 0 6px rgba(255,209,102,0.6); }
        .user-marker { position: relative; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
        .user-dot { width: 12px; height: 12px; background: #378ADD; border-radius: 50%; border: 2px solid white; position: absolute; z-index: 2; }
        .user-pulse { width: 30px; height: 30px; background: rgba(55,138,221,0.3); border-radius: 50%; position: absolute; animation: userPulse 2s ease-out infinite; }
        @keyframes userPulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        .leaflet-tile-pane { filter: brightness(0.85) saturate(0.7) hue-rotate(180deg) invert(1) hue-rotate(180deg); }
      `}</style>
    </div>
  );
}