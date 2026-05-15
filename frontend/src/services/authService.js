const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`)
  return data
}

export const authService = {
  registerInit: (payload) =>
    request('/api/auth/register/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  registerVerify: (email, otp) =>
    request('/api/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    }),

  login: (payload) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request('/api/auth/logout', { method: 'POST' }),

  logoutAll: () =>
    request('/api/auth/logout-all', { method: 'POST' }),

  refresh: () =>
    request('/api/auth/refresh', { method: 'POST' }),

  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token, newPassword) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
}