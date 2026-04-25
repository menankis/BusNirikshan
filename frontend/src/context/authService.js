const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

export const authService = {
  register: (payload) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () =>
    request('/api/auth/logout', { method: 'POST' }),
  refresh: () =>
    request('/api/auth/refresh', { method: 'POST' }),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
};