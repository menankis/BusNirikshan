const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
  return localStorage.getItem('busnirikshan_token');
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

// ── Stops ──────────────────────────────────────────────
export const stopsService = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/stops${q ? '?' + q : ''}`);
  },
  getNearby: (latitude, longitude, radius = 5000) =>
    request(`/api/stops/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
  getById: (id) => request(`/api/stops/${id}`),
};

// ── Buses ───────────────────────────────────────────────
export const busesService = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/buses${q ? '?' + q : ''}`);
  },
  getById: (id) => request(`/api/buses/${id}`),
  getByRoute: (routeId) => request(`/api/buses?route=${routeId}`),
};

// ── Location ────────────────────────────────────────────
export const locationService = {
  updateLocation: (busId, latitude, longitude, heading) =>
    request('/api/location', {
      method: 'POST',
      body: JSON.stringify({ busId, latitude, longitude, heading }),
    }),
  getActiveBuses: () => request('/api/location/active'),
  getBusLocation: (busId) => request(`/api/location/${busId}`),
  getBusHistory: (busId, from, to) =>
    request(`/api/location/${busId}/history?from=${from}&to=${to}`),
};

// ── ETA ─────────────────────────────────────────────────
export const etaService = {
  getETA: (busId, stopId) => request(`/api/eta?busId=${busId}&stopId=${stopId}`),
  getETAForStop: (stopId) => request(`/api/eta/stop/${stopId}`),
};

// ── Routes ──────────────────────────────────────────────
export const routesService = {
  getAll: () => request('/api/routes'),
  getById: (id) => request(`/api/routes/${id}`),
};

// ── Drivers ─────────────────────────────────────────────
export const driversService = {
  getMyShift: () => request('/api/drivers/shift/current'),
  startShift: (busId, routeId) =>
    request('/api/drivers/shift/start', {
      method: 'POST',
      body: JSON.stringify({ busId, routeId }),
    }),
  endShift: () => request('/api/drivers/shift/end', { method: 'POST' }),
  getMyBus: () => request('/api/drivers/bus'),
};