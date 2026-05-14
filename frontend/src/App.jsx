import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import PassengerDashboard from './pages/passenger/PassengerDashboard';
import DriverDashboard from './pages/driver/DriverDashboard';
import './index.css';

function ProtectedRoute({ children, allowedRole }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRole && user?.role && user.role !== allowedRole && user.role !== 'admin') {
    // redirect driver trying to access passenger page and vice versa
    return <Navigate to={user.role === 'driver' ? '/driver' : '/passenger'} replace />;
  }
  return children;
}

function GuestRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return children;
  return <Navigate to={user?.role === 'driver' ? '/driver' : '/passenger'} replace />;
}

// Smart redirect based on role
function RoleRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'driver' ? '/driver' : '/passenger'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />

          {/* Dashboards */}
          <Route path="/passenger" element={<ProtectedRoute allowedRole="passenger"><PassengerDashboard /></ProtectedRoute>} />
          <Route path="/driver" element={<ProtectedRoute allowedRole="driver"><DriverDashboard /></ProtectedRoute>} />

          {/* Smart redirect */}
          <Route path="/dashboard" element={<RoleRedirect />} />
          <Route path="/" element={<RoleRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}