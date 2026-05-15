import { createContext, useContext, useState, useCallback } from 'react'
import { authService } from '../services/authService'

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem('busnirikshan_token') || null
  )

  const user = token ? parseJwt(token) : null

  const saveToken = (t) => {
    setToken(t)
    localStorage.setItem('busnirikshan_token', t)
  }

  const clearToken = () => {
    setToken(null)
    localStorage.removeItem('busnirikshan_token')
  }

  const registerInit = useCallback(async (payload) => {
    return await authService.registerInit(payload)
  }, [])

  const registerVerify = useCallback(async (email, otp) => {
    return await authService.registerVerify(email, otp)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authService.login({ email, password })
    saveToken(data.access_token)
    return data
  }, [])

  const logout = useCallback(async () => {
    await authService.logout().catch(() => {})
    clearToken()
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token,
      registerInit,
      registerVerify,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}