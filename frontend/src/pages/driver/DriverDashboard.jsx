import { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '../../components/shared/Navbar';
import { LiveMap } from '../../components/map/LiveMap';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useGeolocation } from '../../hooks/useGeolocation';
import { driversService, busesService, routesService, locationService } from '../../services/api';
import styles from './DriverDashboard.module.css';

const UPDATE_INTERVAL = 30000; // 30 seconds per spec

export default function DriverDashboard() {
  const { sendLocation, connected, busLocations } = useWebSocket();
  const { position, error: geoError, loading: geoLoading } = useGeolocation();

  const [shift, setShift] = useState(null);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedBus, setSelectedBus] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [shiftLoading, setShiftLoading] = useState(false);
  const [updateLog, setUpdateLog] = useState([]);
  const [nextUpdateIn, setNextUpdateIn] = useState(UPDATE_INTERVAL / 1000);
  const [totalUpdates, setTotalUpdates] = useState(0);
  const [distanceCovered, setDistanceCovered] = useState(0);
  const [lastPosition, setLastPosition] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Load buses and routes
  useEffect(() => {
    Promise.allSettled([busesService.getAll(), routesService.getAll()]).then(([b, r]) => {
      if (b.status === 'fulfilled') setBuses(b.value?.buses || b.value || []);
      if (r.status === 'fulfilled') setRoutes(r.value?.routes || r.value || []);
    });
    // Check if already on shift
    driversService.getMyShift()
      .then(data => { if (data?.shift || data?.busId) setShift(data.shift || data); })
      .catch(() => {});
  }, []);

  // Auto location push every 30s when on shift
  const pushLocation = useCallback(async (pos, manual = false) => {
    if (!pos || !shift) return;

    const wsOk = sendLocation(shift.busId || selectedBus, pos.latitude, pos.longitude, pos.heading);

    // Also POST to REST API as fallback
    try {
      await locationService.updateLocation(
        shift.busId || selectedBus,
        pos.latitude, pos.longitude, pos.heading
      );
    } catch {}

    const log = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      lat: pos.latitude.toFixed(5),
      lng: pos.longitude.toFixed(5),
      method: wsOk ? 'WebSocket' : 'HTTP',
      manual,
    };
    setUpdateLog(prev => [log, ...prev].slice(0, 20));
    setTotalUpdates(c => c + 1);

    // Distance calculation (Haversine)
    if (lastPosition) {
      const d = haversine(lastPosition.latitude, lastPosition.longitude, pos.latitude, pos.longitude);
      setDistanceCovered(prev => prev + d);
    }
    setLastPosition(pos);
    setNextUpdateIn(UPDATE_INTERVAL / 1000);
  }, [shift, selectedBus, sendLocation, lastPosition]);

  // Auto-push interval
  useEffect(() => {
    if (!shift || !position) return;

    intervalRef.current = setInterval(() => {
      pushLocation(position);
    }, UPDATE_INTERVAL);

    countdownRef.current = setInterval(() => {
      setNextUpdateIn(prev => prev <= 1 ? UPDATE_INTERVAL / 1000 : prev - 1);
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [shift, position, pushLocation]);

  async function startShift() {
    if (!selectedBus || !selectedRoute) return;
    setShiftLoading(true);
    try {
      const data = await driversService.startShift(selectedBus, selectedRoute);
      setShift(data.shift || data);
      setUpdateLog([]);
      setTotalUpdates(0);
      setDistanceCovered(0);
    } catch (e) {
      alert(e.message || 'Could not start shift');
    } finally {
      setShiftLoading(false);
    }
  }

  async function endShift() {
    setShiftLoading(true);
    try {
      await driversService.endShift();
      setShift(null);
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    } catch (e) {
      alert(e.message || 'Could not end shift');
    } finally {
      setShiftLoading(false);
    }
  }

  async function manualUpdate() {
    if (!position) return;
    setManualLoading(true);
    await pushLocation(position, true);
    setManualLoading(false);
  }

  const onShift = !!shift;
  const busLocation = position ? { [shift?.busId || 'me']: { ...position, timestamp: Date.now() } } : {};

  return (
    <div className={styles.page}>
      <Navbar role="driver" />

      <div className={styles.layout}>
        {/* ── Left panel ── */}
        <aside className={styles.panel}>
          {/* Connection */}
          <div className={styles.connStatus}>
            <span className={`${styles.connDot} ${connected ? styles.connOnline : styles.connOff}`} />
            <span className={styles.connText}>{connected ? 'WebSocket connected' : 'Reconnecting...'}</span>
          </div>

          {/* Shift card */}
          {!onShift ? (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Start your shift</h2>
              <p className={styles.cardSub}>Select your bus and route to begin broadcasting location.</p>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Assigned Bus</label>
                <select
                  className={styles.select}
                  value={selectedBus}
                  onChange={e => setSelectedBus(e.target.value)}
                >
                  <option value="">Select bus...</option>
                  {buses.map(b => (
                    <option key={b._id} value={b._id}>
                      {b.busNumber || b.registrationNumber || b._id.slice(-6)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Route</label>
                <select
                  className={styles.select}
                  value={selectedRoute}
                  onChange={e => setSelectedRoute(e.target.value)}
                >
                  <option value="">Select route...</option>
                  {routes.map(r => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {geoError && (
                <div className={styles.geoWarn}>
                  <WarnIcon /> Location access denied — enable GPS to broadcast
                </div>
              )}

              <button
                className={styles.startBtn}
                onClick={startShift}
                disabled={!selectedBus || !selectedRoute || shiftLoading || geoLoading}
              >
                {shiftLoading ? 'Starting...' : 'Start shift'}
              </button>
            </div>
          ) : (
            <div className={styles.card}>
              <div className={styles.shiftHeader}>
                <div>
                  <p className={styles.shiftLabel}>On shift</p>
                  <p className={styles.shiftBus}>{shift.busNumber || shift.busId?.slice(-6) || 'Bus active'}</p>
                </div>
                <button className={styles.endBtn} onClick={endShift} disabled={shiftLoading}>
                  {shiftLoading ? '...' : 'End shift'}
                </button>
              </div>

              {/* Stats grid */}
              <div className={styles.statsGrid}>
                <StatBox label="Updates sent" value={totalUpdates} color="teal" />
                <StatBox label="Distance" value={`${distanceCovered.toFixed(1)} km`} color="orange" />
                <StatBox label="Next update" value={`${nextUpdateIn}s`} color="yellow" />
                <StatBox label="GPS accuracy" value={position ? `±${Math.round(position.accuracy || 0)}m` : '—'} color="blue" />
              </div>

              {/* Current position */}
              {position && (
                <div className={styles.posBox}>
                  <div className={styles.posRow}>
                    <span className={styles.posLabel}>Latitude</span>
                    <span className={styles.posVal}>{position.latitude.toFixed(6)}</span>
                  </div>
                  <div className={styles.posRow}>
                    <span className={styles.posLabel}>Longitude</span>
                    <span className={styles.posVal}>{position.longitude.toFixed(6)}</span>
                  </div>
                  <div className={styles.posRow}>
                    <span className={styles.posLabel}>Speed</span>
                    <span className={styles.posVal}>{Math.round((position.speed || 0) * 3.6)} km/h</span>
                  </div>
                </div>
              )}

              {/* Manual update */}
              <button
                className={styles.manualBtn}
                onClick={manualUpdate}
                disabled={!position || manualLoading}
              >
                {manualLoading ? 'Sending...' : '↑ Send location now'}
              </button>
            </div>
          )}

          {/* Update log */}
          {updateLog.length > 0 && (
            <div className={styles.logCard}>
              <p className={styles.logTitle}>Location log</p>
              <div className={styles.logList}>
                {updateLog.map((log, i) => (
                  <div key={log.id} className={`${styles.logEntry} ${i === 0 ? styles.logLatest : ''}`}>
                    <span className={styles.logTime}>{log.time}</span>
                    <span className={styles.logCoords}>{log.lat}, {log.lng}</span>
                    <span className={`${styles.logMethod} ${log.method === 'WebSocket' ? styles.ws : styles.http}`}>
                      {log.method}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Map ── */}
        <main className={styles.mapArea}>
          <LiveMap
            busLocations={onShift && position ? busLocation : busLocations}
            stops={[]}
            userPosition={position}
            selectedBus={shift?.busId}
            onBusClick={() => {}}
          />
          {onShift && (
            <div className={styles.broadcastBanner}>
              <span className={styles.broadcastDot} />
              Broadcasting location every 30s
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className={`${styles.statBox} ${styles[`stat_${color}`]}`}>
      <p className={styles.statVal}>{value}</p>
      <p className={styles.statLabel}>{label}</p>
    </div>
  );
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function WarnIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}