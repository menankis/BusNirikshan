import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navbar } from '../../components/shared/Navbar';
import { LiveMap } from '../../components/map/LiveMap';
import { BusCard } from '../../components/bus/BusCard';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useGeolocation } from '../../hooks/useGeolocation';
import { stopsService, busesService, etaService, locationService, analyticsService } from '../../services/api';
import styles from './PassengerDashboard.module.css';

export default function PassengerDashboard() {
  const { busLocations, connected } = useWebSocket();
  const { position: userPosition } = useGeolocation();

  const [buses, setBuses] = useState([]);
  const [stops, setStops] = useState([]);
  const [nearbyStops, setNearbyStops] = useState([]);
  const [etas, setEtas] = useState({});
  const [selectedBus, setSelectedBus] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('buses');
  const [loading, setLoading] = useState(true);
  const [historyHours, setHistoryHours] = useState(1);
  const [historyTrail, setHistoryTrail] = useState([]);
  const [historyBus, setHistoryBus] = useState(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Load buses and stops on mount
  useEffect(() => {
    async function load() {
      try {
        const [busData, stopData, activeLocations] = await Promise.allSettled([
          busesService.getAll(),
          stopsService.getAll(),
          locationService.getActiveBuses(),
        ]);
        if (busData.status === 'fulfilled') setBuses(busData.value?.buses || busData.value || []);
        if (stopData.status === 'fulfilled') setStops(stopData.value?.stops || stopData.value || []);
      } catch (e) {
        // silent fail — data loads progressively
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch nearby stops when user position changes
  useEffect(() => {
    if (!userPosition) return;
    stopsService.getNearby(userPosition.latitude, userPosition.longitude, 2000)
      .then(data => setNearbyStops(data?.stops || data || []))
      .catch(() => {});
  }, [userPosition?.latitude, userPosition?.longitude]);

  // Fetch ETAs for selected stop
  useEffect(() => {
    if (!selectedStop) return;
    etaService.getETAForStop(selectedStop._id)
      .then(data => {
        const etaMap = {};
        (data?.etas || data || []).forEach(e => { etaMap[e.busId] = e; });
        setEtas(etaMap);
      })
      .catch(() => {});
  }, [selectedStop]);

  const filteredBuses = useMemo(() => {
    if (!searchQuery) return buses;
    const q = searchQuery.toLowerCase();
    return buses.filter(b =>
      (b.busNumber || '').toLowerCase().includes(q) ||
      (b.routeName || '').toLowerCase().includes(q) ||
      (b.route?.name || '').toLowerCase().includes(q)
    );
  }, [buses, searchQuery]);

  const handleBusClick = useCallback((busId) => {
    setSelectedBus(prev => prev === busId ? null : busId);
  }, []);

  const loadBusHistory = useCallback(async () => {
    if (!selectedBus) {
      setHistoryError('Select a bus first');
      return;
    }
    const to = Date.now();
    const from = to - Number(historyHours) * 60 * 60 * 1000;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data = await analyticsService.getBusTrail(selectedBus, from, to);
      const trail = data.trail || [];
      setHistoryTrail(trail);
      setHistoryBus(data.bus || null);
      setHistoryIndex(Math.max(0, trail.length - 1));
      if (trail.length === 0) setHistoryError('No recorded points found for this range');
    } catch (err) {
      setHistoryTrail([]);
      setHistoryBus(null);
      setHistoryError(err.message || 'Could not load bus history');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyHours, selectedBus]);

  const displayedStops = selectedStop ? [selectedStop] : nearbyStops.slice(0, 6);

  return (
    <div className={styles.page}>
      <Navbar role="passenger" />

      <div className={styles.layout}>
        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          {/* Connection status */}
          <div className={styles.statusBar}>
            <span className={`${styles.statusDot} ${connected ? styles.online : styles.offline}`} />
            <span className={styles.statusText}>{connected ? 'Live updates active' : 'Connecting...'}</span>
          </div>

          {/* Search */}
          <div className={styles.searchWrap}>
            <SearchIcon />
            <input
              className={styles.searchInput}
              placeholder="Search buses or routes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${activeTab === 'buses' ? styles.tabActive : ''}`} onClick={() => setActiveTab('buses')}>
              Buses {Object.keys(busLocations).length > 0 && <span className={styles.tabBadge}>{Object.keys(busLocations).length}</span>}
            </button>
            <button className={`${styles.tab} ${activeTab === 'stops' ? styles.tabActive : ''}`} onClick={() => setActiveTab('stops')}>
              Nearby Stops
            </button>
            <button className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`} onClick={() => setActiveTab('history')}>
              History
            </button>
          </div>

          {/* Content */}
          <div className={styles.listWrap}>
            {activeTab === 'buses' && (
              <>
                {loading ? (
                  <LoadingSkeleton count={4} />
                ) : filteredBuses.length === 0 ? (
                  <EmptyState icon={<BusEmptyIcon />} text="No buses found" />
                ) : (
                  filteredBuses.map(bus => (
                    <BusCard
                      key={bus._id}
                      bus={bus}
                      location={busLocations[bus._id]}
                      eta={etas[bus._id]}
                      isSelected={selectedBus === bus._id}
                      onClick={() => handleBusClick(bus._id)}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === 'stops' && (
              <>
                {!userPosition && (
                  <div className={styles.locationNote}>
                    <LocationIcon />
                    <span>Enable location to see nearby stops</span>
                  </div>
                )}
                {displayedStops.length === 0 && userPosition && (
                  <EmptyState icon={<StopEmptyIcon />} text="No stops nearby" />
                )}
                {displayedStops.map(stop => (
                  <StopCard
                    key={stop._id}
                    stop={stop}
                    isSelected={selectedStop?._id === stop._id}
                    onClick={() => setSelectedStop(prev => prev?._id === stop._id ? null : stop)}
                  />
                ))}
                {selectedStop && etas && Object.keys(etas).length > 0 && (
                  <div className={styles.etaSection}>
                    <p className={styles.etaTitle}>Arriving at {selectedStop.name}</p>
                    {Object.values(etas).slice(0, 4).map(eta => (
                      <div key={eta.busId} className={styles.etaRow}>
                        <span className={styles.etaBusNum}>{eta.busNumber || eta.busId?.slice(-6)}</span>
                        <span className={styles.etaTime}>{Math.round(eta.minutes)} min</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'history' && (
              <div className={styles.historyPanel}>
                <div className={styles.historyMeta}>
                  <span>Selected bus</span>
                  <strong>{historyBus?.registrationNumber || selectedBus?.slice(-6) || 'None'}</strong>
                </div>
                <label className={styles.historyLabel}>
                  Time range
                  <select
                    className={styles.historySelect}
                    value={historyHours}
                    onChange={e => setHistoryHours(e.target.value)}
                  >
                    <option value="1">Last 1 hour</option>
                    <option value="3">Last 3 hours</option>
                    <option value="6">Last 6 hours</option>
                    <option value="12">Last 12 hours</option>
                    <option value="24">Last 24 hours</option>
                  </select>
                </label>
                <button className={styles.historyBtn} onClick={loadBusHistory} disabled={historyLoading}>
                  {historyLoading ? 'Loading trail...' : 'Load path replay'}
                </button>
                {historyTrail.length > 0 && (
                  <>
                    <div className={styles.historyMeta}>
                      <span>Recorded points</span>
                      <strong>{historyTrail.length}</strong>
                    </div>
                    <input
                      className={styles.historyRange}
                      type="range"
                      min="0"
                      max={historyTrail.length - 1}
                      value={historyIndex}
                      onChange={e => setHistoryIndex(Number(e.target.value))}
                    />
                    <div className={styles.historyTime}>
                      {new Date(historyTrail[historyIndex]?.timestamp).toLocaleString()}
                    </div>
                  </>
                )}
                {historyError && <div className={styles.historyError}>{historyError}</div>}
              </div>
            )}
          </div>
        </aside>

        {/* ── Map ── */}
        <main className={styles.mapArea}>
          <LiveMap
            busLocations={busLocations}
            stops={stops}
            userPosition={userPosition}
            selectedBus={selectedBus}
            onBusClick={handleBusClick}
            replayTrail={historyTrail}
            replayIndex={historyIndex}
          />

          {/* Floating stats */}
          <div className={styles.floatingStats}>
            <StatChip icon={<BusChipIcon />} value={Object.keys(busLocations).length} label="Live" />
            <StatChip icon={<StopChipIcon />} value={nearbyStops.length} label="Stops nearby" />
          </div>
        </main>
      </div>
    </div>
  );
}

function StopCard({ stop, isSelected, onClick }) {
  return (
    <div className={`${styles.stopCard} ${isSelected ? styles.stopSelected : ''}`} onClick={onClick}>
      <div className={styles.stopDot} />
      <div>
        <p className={styles.stopName}>{stop.name}</p>
        <p className={styles.stopCity}>{stop.city} · {stop.rtc?.join(', ')}</p>
      </div>
    </div>
  );
}

function StatChip({ icon, value, label }) {
  return (
    <div className={styles.statChip}>
      {icon}
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function LoadingSkeleton({ count }) {
  return Array.from({ length: count }).map((_, i) => (
    <div key={i} className={styles.skeleton} style={{ animationDelay: `${i * 0.1}s` }} />
  ));
}

function EmptyState({ icon, text }) {
  return (
    <div className={styles.emptyState}>
      {icon}
      <p>{text}</p>
    </div>
  );
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function LocationIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function BusEmptyIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 9h20M7 17l-2 4M17 17l2 4M7 9v8M17 9v8"/></svg>;
}
function StopEmptyIcon() {
  return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function BusChipIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M2 9h20M7 17l-2 4M17 17l2 4"/></svg>;
}
function StopChipIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
