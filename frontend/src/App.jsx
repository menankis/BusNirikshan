import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

/* Pages */
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import OtpVerifyPage from './pages/auth/OtpVerifyPage'

/* Dashboards */
import PassengerDashboard from './pages/passenger/PassengerDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import DriverDashboard from './pages/driver/DriverDashboard'

/* Context */
import { AuthProvider, useAuth } from './context/AuthContext'

function dashboardPathForRole(role) {
  if (role === 'admin') return '/admin'
  if (role === 'driver') return '/driver'
  return '/passenger'
}

function RequireRole({ roles, children }) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!roles.includes(user?.role)) {
    return <Navigate to={dashboardPathForRole(user?.role)} replace />
  }

  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-otp" element={<OtpVerifyPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Dashboard Routes */}
          <Route
            path="/passenger"
            element={
              <RequireRole roles={['user', 'passenger']}>
                <PassengerDashboard />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole roles={['admin']}>
                <AdminDashboard />
              </RequireRole>
            }
          />

          {/* Driver Dashboard */}
          <Route
            path="/driver"
            element={
              <RequireRole roles={['driver']}>
                <DriverDashboard />
              </RequireRole>
            }
          />

          {/* Fallback */}
          <Route
            path="*"
            element={
              <div style={{
                color: 'white',
                background: '#001933',
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: '32px'
              }}>
                404 - Page Not Found
              </div>
            }
          />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
