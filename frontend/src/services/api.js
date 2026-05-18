const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function getToken() {
  return localStorage.getItem('busnirikshan_token')
}

async function request(endpoint, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`)
  return data
}

export const stopsService = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/stops${q ? '?' + q : ''}`)
  },
  getNearby: (latitude, longitude, radius = 5000) =>
    request(`/api/stops/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
  getById: (id) => request(`/api/stops/${id}`),
}

export const busesService = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/buses${q ? '?' + q : ''}`)
  },
  getById: (id) => request(`/api/buses/${id}`),
}

export const locationService = {
  updateLocation: (lat, lng, speed_kmh, heading_deg) =>
    request('/api/locations/', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, speed_kmh, heading_deg, timestamp: Date.now() }),
   }),
  getActiveBuses: () => request('/api/locations/live'),
  getBusLocation: (busId) => request(`/api/locations/${busId}`),
  getBusHistory: (busId, from, to) =>
    request(`/api/analytics/bus/${busId}/trail?from=${from}&to=${to}`),
}

export const analyticsService = {
  getBusTrail: (busId, from, to) =>
    request(`/api/analytics/bus/${busId}/trail?from=${from}&to=${to}`),
  getBusSummary: (busId, from, to) =>
    request(`/api/analytics/bus/${busId}/summary?from=${from}&to=${to}`),
  getBusSpeed: (busId, from, to, interval = 'hour') =>
    request(`/api/analytics/bus/${busId}/speed?from=${from}&to=${to}&interval=${interval}`),
  getStopTraffic: (stopId, from, to) =>
    request(`/api/analytics/stops/${stopId}/traffic?from=${from}&to=${to}`),
  getActiveBusStats: () => request('/api/analytics/system/active-buses'),
}

export const etaService = {
  getBusETA: (busId, stopId) => request(`/api/buses/${busId}/eta?stopId=${stopId}`),
  getETAForStop: (stopId) => request(`/api/eta/stop/${stopId}`),
}

export const routesService = {
  getAll: () => request('/api/routes'),
  getById: (id) => request(`/api/routes/${id}`),
}

export const driversService = {
  getMyProfile: () => request('/api/drivers/me'),
  getById: (driverId) => request(`/api/drivers/${driverId}`),

  startShift: (driverId, busId, routeId) =>
    request(`/api/drivers/${driverId}/shift/start`, {
      method: 'POST',
      body: JSON.stringify({ busId, routeId }),
    }),

  endShift: (driverId) =>
    request(`/api/drivers/${driverId}/shift/end`, { method: 'POST' }),
}
