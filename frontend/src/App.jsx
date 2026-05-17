import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

/* Pages */
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'

/* Dashboards */
import PassengerDashboard from './pages/passenger/PassengerDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import DriverDashboard from './pages/driver/DriverDashboard'

/* Context */
import { AuthProvider } from './context/AuthContext'

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
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Dashboard Routes */}
          <Route path="/passenger" element={<PassengerDashboard />} />
          <Route path="/admin" element = {<AdminDashboard />} />

          {/* Driver Dashboard */}
          <Route path="/driver" element={<DriverDashboard />} />

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