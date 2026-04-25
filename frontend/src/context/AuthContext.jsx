import { createContext, useContext, useState, useCallback } from 'react';
import { authService } from "./authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('busnirikshan_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('busnirikshan_token') || null);

  const login = useCallback(async (email, password) => {
    const data = await authService.login({ email, password });
    setToken(data.access_token);
    setUser(data.user || { email });
    localStorage.setItem('busnirikshan_token', data.access_token);
    if (data.user) localStorage.setItem('busnirikshan_user', JSON.stringify(data.user));
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    return await authService.register(payload);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout().catch(() => {});
    setUser(null);
    setToken(null);
    localStorage.removeItem('busnirikshan_token');
    localStorage.removeItem('busnirikshan_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}