import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './AdminDashboard.module.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const RTC_OPTIONS = ['GSRTC', 'MSRTC', 'KSRTC', 'UPSRTC', 'RSRTC', 'TNSTC', 'TSRTC', 'PRTC', 'Other'];

function getToken() {
  return localStorage.getItem('busnirikshan_token');
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'buses', label: 'Buses', icon: '🚌' },
  { id: 'analytics', label: 'Analytics', icon: 'A' },
  { id: 'routes', label: 'Routes', icon: '🗺️' },
  { id: 'stops', label: 'Stops', icon: '📍' },
  { id: 'drivers', label: 'Drivers', icon: '👨‍✈️' },
  { id: 'health', label: 'System Health', icon: '💊' },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  // Redirect non-admins
  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate(user.role === 'driver' ? '/driver' : '/passenger');
    }
  }, [user, navigate]);

  return (
    <div className={styles.page}>
      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logoRow}>
            <BusLogo />
            {sidebarOpen && <span className={styles.logoText}>BusNirikshan</span>}
          </div>
          {sidebarOpen && <span className={styles.adminBadge}>Admin</span>}
        </div>

        <nav className={styles.nav}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.navItem} ${activeSection === s.id ? styles.navActive : ''}`}
              onClick={() => setActiveSection(s.id)}
              title={!sidebarOpen ? s.label : ''}
            >
              <span className={styles.navIcon}>{s.icon}</span>
              {sidebarOpen && <span className={styles.navLabel}>{s.label}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          {sidebarOpen && (
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>
                {(user?.name || 'A')[0].toUpperCase()}
              </div>
              <div>
                <p className={styles.userName}>{user?.name || 'Admin'}</p>
                <p className={styles.userEmail}>{user?.email}</p>
              </div>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
            <LogoutIcon />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>


      {/* ── Main ── */}
      <main className={styles.main}>
        {/* Top bar */}
        <div className={styles.topbar}>
          <button className={styles.toggleBtn} onClick={() => setSidebarOpen(v => !v)}>
            <MenuIcon />
          </button>
          <h1 className={styles.pageTitle}>
            {SECTIONS.find(s => s.id === activeSection)?.label}
          </h1>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'users' && <UsersSection />}
          {activeSection === 'buses' && <BusesSection />}
          {activeSection === 'analytics' && <AnalyticsSection />}
          {activeSection === 'routes' && <RoutesSection />}
          {activeSection === 'stops' && <StopsSection />}
          {activeSection === 'drivers' && <DriversSection />}
          {activeSection === 'health' && <HealthSection />}
        </div>
      </main>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewSection() {
  const [stats, setStats] = useState({
    users: null, buses: null, routes: null, stops: null, drivers: null, activeBuses: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, buses, routes, stops, drivers, active] = await Promise.allSettled([
        apiRequest('/api/admin/users?limit=1'),
        apiRequest('/api/buses?limit=1'),
        apiRequest('/api/routes?limit=1'),
        apiRequest('/api/stops?limit=1'),
        apiRequest('/api/drivers?limit=1'),
        apiRequest('/api/analytics/system/active-buses'),
      ]);

      setStats({
        users: users.value?.pagination?.total ?? users.value?.total ?? users.value?.count ?? '—',
        buses: buses.value?.pagination?.total ?? buses.value?.total ?? buses.value?.count ?? '—',
        routes: routes.value?.pagination?.total ?? routes.value?.total ?? routes.value?.count ?? '—',
        stops: stops.value?.pagination?.total ?? stops.value?.total ?? stops.value?.count ?? '—',
        drivers: drivers.value?.pagination?.total ?? drivers.value?.total ?? drivers.value?.count ?? '—',
        activeBuses: active.value?.summary?.totalActive ?? active.value?.count ?? active.value?.activeBuses ?? '—',
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: 'Total Users', value: stats.users, color: 'teal', icon: '👥' },
    { label: 'Total Buses', value: stats.buses, color: 'orange', icon: '🚌' },
    { label: 'Active Buses', value: stats.activeBuses, color: 'green', icon: '📡' },
    { label: 'Total Routes', value: stats.routes, color: 'yellow', icon: '🗺️' },
    { label: 'Total Stops', value: stats.stops, color: 'blue', icon: '📍' },
    { label: 'Total Drivers', value: stats.drivers, color: 'purple', icon: '👨‍✈️' },
  ];

  return (
    <div className={styles.overviewGrid}>
      {cards.map(card => (
        <div key={card.label} className={`${styles.statCard} ${styles[`stat_${card.color}`]}`}>
          <span className={styles.statIcon}>{card.icon}</span>
          <div>
            <p className={styles.statValue}>{loading ? '...' : card.value}</p>
            <p className={styles.statLabel}>{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

function UsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (roleFilter) q.set('role', roleFilter);
      q.set('limit', '50');
      const data = await apiRequest(`/api/admin/users?${q}`);
      setUsers(data.users || data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => { load(); }, [load]);

  async function changeRole(userId, newRole) {
    setUpdating(userId);
    try {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      alert(e.message);
    } finally {
      setUpdating(null);
    }
  }

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="user">Passenger</option>
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>RTC</th>
              <th>Status</th>
              <th>Change Role</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={styles.loadingRow}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className={styles.loadingRow}>No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u._id}>
                <td>{u.name || '—'}</td>
                <td className={styles.emailCell}>{u.email}</td>
                <td><RoleBadge role={u.role} /></td>
                <td>{u.rtc || '—'}</td>
                <td>
                  <span className={`${styles.statusDot} ${u.isActive ? styles.active : styles.inactive}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <select
                    className={styles.roleSelect}
                    value={u.role}
                    disabled={updating === u._id}
                    onChange={e => changeRole(u._id, e.target.value)}
                  >
                    <option value="user">Passenger</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Buses ────────────────────────────────────────────────────────────────────

function BusesSection() {
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    routeId: '',
    registrationNumber: '',
    capacity: '',
    isActive: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [busData, routeData] = await Promise.all([
        apiRequest('/api/buses?limit=100'),
        apiRequest('/api/routes?limit=100'),
      ]);
      const loadedRoutes = routeData.routes || routeData || [];
      setBuses(busData.buses || busData || []);
      setRoutes(loadedRoutes);
      setForm(prev => ({ ...prev, routeId: prev.routeId || loadedRoutes[0]?._id || '' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createBus(e) {
    e.preventDefault();
    const route = routes.find(r => r._id === form.routeId);
    if (!route) {
      setError('Select a route before adding a bus');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/buses', {
        method: 'POST',
        body: JSON.stringify({
          routeId: route._id,
          rtc: route.rtc,
          routeName: route.name,
          registrationNumber: form.registrationNumber.trim().toUpperCase(),
          capacity: Number(form.capacity),
          isActive: form.isActive,
        }),
      });
      setForm(prev => ({ ...prev, registrationNumber: '', capacity: '', isActive: false }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <form className={styles.adminForm} onSubmit={createBus}>
        <div className={styles.formHeader}>
          <p className={styles.formTitle}>Add bus</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.formField}>
            <span>Route</span>
            <select
              className={styles.formControl}
              value={form.routeId}
              onChange={e => setForm(prev => ({ ...prev, routeId: e.target.value }))}
              required
            >
              <option value="">Select route</option>
              {routes.map(route => (
                <option key={route._id} value={route._id}>{route.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.formField}>
            <span>Registration</span>
            <input
              className={styles.formControl}
              value={form.registrationNumber}
              onChange={e => setForm(prev => ({ ...prev, registrationNumber: e.target.value }))}
              placeholder="RJ14-NEW-3001"
              required
            />
          </label>
          <label className={styles.formField}>
            <span>Capacity</span>
            <input
              className={styles.formControl}
              type="number"
              min="1"
              value={form.capacity}
              onChange={e => setForm(prev => ({ ...prev, capacity: e.target.value }))}
              placeholder="42"
              required
            />
          </label>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
            />
            Active now
          </label>
        </div>
        <button className={styles.primaryBtn} type="submit" disabled={saving || loading}>
          {saving ? 'Adding...' : 'Add bus'}
        </button>
      </form>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Registration</th>
              <th>RTC</th>
              <th>Route</th>
              <th>Capacity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.loadingRow}>Loading...</td></tr>
            ) : buses.length === 0 ? (
              <tr><td colSpan={5} className={styles.loadingRow}>No buses found</td></tr>
            ) : buses.map(b => (
              <tr key={b._id}>
                <td className={styles.monoCell}>{b.registrationNumber || '—'}</td>
                <td>{b.rtc || '—'}</td>
                <td>{b.routeName || b.route?.name || '—'}</td>
                <td>{b.capacity || '—'}</td>
                <td>
                  <span className={`${styles.statusDot} ${b.isActive ? styles.active : styles.inactive}`}>
                    {b.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Routes ───────────────────────────────────────────────────────────────────

function AnalyticsSection() {
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState('');
  const [rangeHours, setRangeHours] = useState('24');
  const [systemStats, setSystemStats] = useState(null);
  const [busSummary, setBusSummary] = useState(null);
  const [speedStats, setSpeedStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      setError('');
      try {
        const [busData, activeData] = await Promise.all([
          apiRequest('/api/buses?limit=100'),
          apiRequest('/api/analytics/system/active-buses'),
        ]);
        const loadedBuses = busData.buses || busData || [];
        setBuses(loadedBuses);
        setSelectedBus(loadedBuses[0]?._id || '');
        setSystemStats(activeData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  const loadBusAnalytics = useCallback(async () => {
    if (!selectedBus) return;
    setLoading(true);
    setError('');
    const to = Date.now();
    const from = to - Number(rangeHours) * 60 * 60 * 1000;
    try {
      const [summaryData, speedData] = await Promise.all([
        apiRequest(`/api/analytics/bus/${selectedBus}/summary?from=${from}&to=${to}`),
        apiRequest(`/api/analytics/bus/${selectedBus}/speed?from=${from}&to=${to}&interval=hour`),
      ]);
      setBusSummary(summaryData);
      setSpeedStats(speedData.stats || []);
    } catch (err) {
      setError(err.message);
      setBusSummary(null);
      setSpeedStats([]);
    } finally {
      setLoading(false);
    }
  }, [rangeHours, selectedBus]);

  useEffect(() => { loadBusAnalytics(); }, [loadBusAnalytics]);

  const summary = systemStats?.summary || {};
  const bus = busSummary?.bus || {};
  const metrics = [
    { label: 'Active buses', value: summary.totalActive ?? '-' },
    { label: 'Inactive buses', value: summary.totalInactive ?? '-' },
    { label: 'GPS pings', value: busSummary?.summary?.totalPings ?? '-' },
    { label: 'Avg speed', value: `${busSummary?.summary?.avgSpeed_kmh ?? 0} km/h` },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <select className={styles.filterSelect} value={selectedBus} onChange={e => setSelectedBus(e.target.value)}>
          {buses.map(bus => (
            <option key={bus._id} value={bus._id}>{bus.registrationNumber || bus._id}</option>
          ))}
        </select>
        <select className={styles.filterSelect} value={rangeHours} onChange={e => setRangeHours(e.target.value)}>
          <option value="1">Last 1 hour</option>
          <option value="6">Last 6 hours</option>
          <option value="12">Last 12 hours</option>
          <option value="24">Last 24 hours</option>
        </select>
        <button className={styles.refreshBtn} onClick={loadBusAnalytics} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.overviewGrid}>
        {metrics.map(metric => (
          <div key={metric.label} className={`${styles.statCard} ${styles.stat_blue}`}>
            <div>
              <p className={styles.statValue}>{loading ? '...' : metric.value}</p>
              <p className={styles.statLabel}>{metric.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.rawBox}>
        <p className={styles.rawTitle}>
          {bus.registrationNumber ? `${bus.registrationNumber} speed by hour` : 'Speed by hour'}
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Period</th>
              <th>Avg</th>
              <th>Max</th>
              <th>Min</th>
              <th>Readings</th>
            </tr>
          </thead>
          <tbody>
            {speedStats.length === 0 ? (
              <tr><td colSpan={5} className={styles.loadingRow}>No speed data for this range</td></tr>
            ) : speedStats.map((row, index) => (
              <tr key={index}>
                <td>{formatPeriod(row.period)}</td>
                <td>{row.avgSpeed_kmh} km/h</td>
                <td>{row.maxSpeed_kmh} km/h</td>
                <td>{row.minSpeed_kmh} km/h</td>
                <td>{row.readings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPeriod(period) {
  if (!period) return '-';
  const hour = period.hour !== undefined ? ` ${String(period.hour).padStart(2, '0')}:00` : '';
  return `${period.day}/${period.month}/${period.year}${hour}`;
}

function RoutesSection() {
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    rtc: 'RSRTC',
    stopIds: [],
    totalDistanceKm: '',
    estimatedDurationMin: '',
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [routeData, stopData] = await Promise.all([
        apiRequest('/api/routes?limit=100'),
        apiRequest('/api/stops?limit=200'),
      ]);
      setRoutes(routeData.routes || routeData || []);
      setStops(stopData.stops || stopData || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createRoute(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/routes', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          rtc: form.rtc,
          stopIds: form.stopIds,
          totalDistanceKm: Number(form.totalDistanceKm),
          estimatedDurationMin: Number(form.estimatedDurationMin),
          isActive: form.isActive,
        }),
      });
      setForm(prev => ({
        ...prev,
        name: '',
        stopIds: [],
        totalDistanceKm: '',
        estimatedDurationMin: '',
        isActive: true,
      }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.section}>
      <form className={styles.adminForm} onSubmit={createRoute}>
        <div className={styles.formHeader}>
          <p className={styles.formTitle}>Add route</p>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.formField}>
            <span>Name</span>
            <input
              className={styles.formControl}
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Jaipur Route J3 - Airport to Ajmeri Gate"
              required
            />
          </label>
          <label className={styles.formField}>
            <span>RTC</span>
            <select
              className={styles.formControl}
              value={form.rtc}
              onChange={e => setForm(prev => ({ ...prev, rtc: e.target.value }))}
              required
            >
              {RTC_OPTIONS.map(rtc => <option key={rtc} value={rtc}>{rtc}</option>)}
            </select>
          </label>
          <label className={styles.formField}>
            <span>Distance km</span>
            <input
              className={styles.formControl}
              type="number"
              step="0.1"
              min="0.1"
              value={form.totalDistanceKm}
              onChange={e => setForm(prev => ({ ...prev, totalDistanceKm: e.target.value }))}
              placeholder="12.5"
              required
            />
          </label>
          <label className={styles.formField}>
            <span>Duration min</span>
            <input
              className={styles.formControl}
              type="number"
              min="1"
              value={form.estimatedDurationMin}
              onChange={e => setForm(prev => ({ ...prev, estimatedDurationMin: e.target.value }))}
              placeholder="35"
              required
            />
          </label>
          <label className={styles.formField}>
            <span>Stops</span>
            <select
              className={`${styles.formControl} ${styles.multiSelect}`}
              multiple
              value={form.stopIds}
              onChange={e => setForm(prev => ({
                ...prev,
                stopIds: Array.from(e.target.selectedOptions, option => option.value),
              }))}
            >
              {stops.map(stop => (
                <option key={stop._id} value={stop._id}>
                  {stop.name} ({stop.city})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.checkField}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
            />
            Active route
          </label>
        </div>
        <button className={styles.primaryBtn} type="submit" disabled={saving || loading}>
          {saving ? 'Adding...' : 'Add route'}
        </button>
      </form>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>RTC</th>
              <th>Distance (km)</th>
              <th>Est. Duration</th>
              <th>Stops</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={styles.loadingRow}>Loading...</td></tr>
            ) : routes.length === 0 ? (
              <tr><td colSpan={6} className={styles.loadingRow}>No routes found</td></tr>
            ) : routes.map(r => (
              <tr key={r._id}>
                <td>{r.name}</td>
                <td>{r.rtc || '—'}</td>
                <td>{r.totalDistanceKm ?? '—'}</td>
                <td>{r.estimatedDurationMin ? `${r.estimatedDurationMin} min` : '—'}</td>
                <td>{r.stopIds?.length ?? '—'}</td>
                <td>
                  <span className={`${styles.statusDot} ${r.isActive ? styles.active : styles.inactive}`}>
                    {r.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stops ────────────────────────────────────────────────────────────────────

function StopsSection() {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiRequest('/api/stops?limit=100')
      .then(d => setStops(d.stops || d || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = stops.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>City</th>
              <th>State</th>
              <th>RTC</th>
              <th>Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.loadingRow}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className={styles.loadingRow}>No stops found</td></tr>
            ) : filtered.map(s => {
              const lat = s.location?.coordinates?.[1] ?? s.latitude;
              const lng = s.location?.coordinates?.[0] ?? s.longitude;
              return (
                <tr key={s._id}>
                  <td>{s.name}</td>
                  <td>{s.city || '—'}</td>
                  <td>{s.state || '—'}</td>
                  <td>{Array.isArray(s.rtc) ? s.rtc.join(', ') : s.rtc || '—'}</td>
                  <td className={styles.monoCell}>
                    {lat && lng ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Drivers ──────────────────────────────────────────────────────────────────

function DriversSection() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/drivers?limit=50')
      .then(d => setDrivers(d.drivers || d || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.section}>
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Driver ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>RTC</th>
              <th>License</th>
              <th>Assigned Bus</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={styles.loadingRow}>Loading...</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={7} className={styles.loadingRow}>No drivers found</td></tr>
            ) : drivers.map(d => (
              <tr key={d._id}>
                <td className={styles.monoCell}>{d._id}</td>
                <td>{d.userId?.name || d.name || '—'}</td>
                <td className={styles.emailCell}>{d.userId?.email || d.email || '—'}</td>
                <td>{d.rtc || '—'}</td>
                <td className={styles.monoCell}>{d.licenseNumber || '—'}</td>
                <td className={styles.monoCell}>{d.busId?.registrationNumber || d.busId || '—'}</td>
                <td>
                  <span className={`${styles.statusDot} ${d.isActive ? styles.active : styles.inactive}`}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Health ───────────────────────────────────────────────────────────────────

function HealthSection() {
  const [health, setHealth] = useState(null);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, i] = await Promise.allSettled([
        apiRequest('/api/admin/system/health'),
        apiRequest('/api/admin/system/instances'),
      ]);
      if (h.status === 'fulfilled') setHealth(h.value);
      if (i.status === 'fulfilled') setInstances(i.value?.instances || i.value || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.section}>
      <div className={styles.sectionToolbar}>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.loadingRow}>Loading health data...</div>
      ) : (
        <>
          {/* Service status */}
          <div className={styles.healthGrid}>
            <HealthCard
              label="MongoDB"
              status={health?.services?.mongodb || health?.mongodb || health?.database}
              icon="🍃"
            />
            <HealthCard
              label="Redis"
              status={health?.services?.redis || health?.redis || health?.cache}
              icon="⚡"
            />
            <HealthCard
              label="API Server"
              status={health ? 'ok' : 'error'}
              icon="🖥️"
            />
            <HealthCard
              label="Active Instances"
              status="ok"
              value={instances.length}
              icon="📦"
            />
          </div>

          {/* Raw health data */}
          {health && (
            <div className={styles.rawBox}>
              <p className={styles.rawTitle}>Raw health response</p>
              <pre className={styles.rawPre}>
                {JSON.stringify(health, null, 2)}
              </pre>
            </div>
          )}

          {/* Instances */}
          {instances.length > 0 && (
            <div className={styles.rawBox}>
              <p className={styles.rawTitle}>Node instances</p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Instance ID</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst, i) => (
                    <tr key={i}>
                      <td className={styles.monoCell}>{inst.id || inst.instanceId || `Instance ${i + 1}`}</td>
                      <td><span className={`${styles.statusDot} ${styles.active}`}>Online</span></td>
                      <td>{inst.lastSeen ? new Date(inst.lastSeen).toLocaleTimeString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function HealthCard({ label, status, icon, value }) {
  const state = typeof status === 'object' ? status?.status : status;
  const detail = typeof status === 'object'
    ? status?.latency_ms !== null && status?.latency_ms !== undefined
      ? `${status.latency_ms} ms`
      : status?.error
    : null;
  const isOk = state === 'ok' || state === 'connected' || state === 'healthy';
  return (
    <div className={`${styles.healthCard} ${isOk ? styles.healthOk : styles.healthErr}`}>
      <span className={styles.healthIcon}>{icon}</span>
      <div>
        <p className={styles.healthLabel}>{label}</p>
        <p className={styles.healthStatus}>
          {value !== undefined ? value : (isOk ? '✓ Online' : '✗ Offline')}
        </p>
        {detail && <p className={styles.healthLabel}>{detail}</p>}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const colors = {
    admin: styles.roleAdmin,
    driver: styles.roleDriver,
    passenger: styles.rolePassenger,
    user: styles.rolePassenger,
  };
  return (
    <span className={`${styles.roleBadge} ${colors[role] || ''}`}>{role === 'user' ? 'passenger' : role}</span>
  );
}

function BusLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill="#FF6B2C"/>
      <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z" fill="white" fillOpacity="0.95"/>
      <rect x="7" y="20" width="18" height="4" rx="1" fill="white" fillOpacity="0.8"/>
      <circle cx="11" cy="24" r="2" fill="#FF6B2C"/>
      <circle cx="21" cy="24" r="2" fill="#FF6B2C"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
