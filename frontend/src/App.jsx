import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgetPasswordPage from "./pages/auth/ForgetPasswordPage";
import './index.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
}

function PlaceholderDashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap: 16 }}>
      <h1 style={{ fontFamily:'var(--font-display)', fontSize: 28 }}>Dashboard coming soon 🚌</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Logged in as {user?.email}</p>
      <button onClick={logout} style={{ padding:'10px 20px', background:'var(--brand-orange)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:14 }}>
        Sign out
      </button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgetPasswordPage /></GuestRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><PlaceholderDashboard /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}