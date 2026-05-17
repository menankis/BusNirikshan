import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

export default function OtpVerifyPage() {
  const { registerVerify } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = location.state?.email || searchParams.get('email') || '';
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleVerifySubmit(e) {
    e.preventDefault();
    if (!email) {
      setOtpError('Start registration again so we know which email to verify');
      return;
    }
    if (!otp || otp.length !== 6) {
      setOtpError('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await registerVerify(email, otp);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setOtpError(err.message || 'Invalid OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <AuthBg />
        <div className={styles.container}>
          <LogoRow />
          <div className={`${styles.card} ${styles.successCard}`}>
            <CheckIcon />
            <h2 className={styles.successTitle}>Email verified</h2>
            <p className={styles.successSubtitle}>Redirecting you to sign in...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AuthBg />
      <div className={styles.container}>
        <LogoRow />
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Verify OTP</h1>
            <p className={styles.subtitle}>
              Enter the 6-digit code sent to <strong style={{ color: '#F0F4FF' }}>{email || 'your email'}</strong>.
            </p>
          </div>

          <form onSubmit={handleVerifySubmit} className={styles.form} noValidate>
            <FormInput
              label="6-digit OTP"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
              placeholder="123456"
              error={otpError}
              icon={<OtpIcon />}
              autoComplete="one-time-code"
            />

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify account'}
            </button>

            <Link to="/register" className={styles.ghostBtn}>
              Back to registration
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

function AuthBg() {
  return (
    <div className={styles.bg} aria-hidden="true">
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgGrid} />
    </div>
  );
}

function LogoRow() {
  return (
    <div className={styles.logoRow}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="10" fill="#FF6B2C"/>
        <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z" fill="white" fillOpacity="0.95"/>
        <rect x="7" y="20" width="18" height="4" rx="1" fill="white" fillOpacity="0.8"/>
        <circle cx="11" cy="24" r="2" fill="#FF6B2C"/>
        <circle cx="21" cy="24" r="2" fill="#FF6B2C"/>
      </svg>
      <span className={styles.logoText}>BusNirikshan</span>
    </div>
  );
}

function OtpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#06D6A0" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="7 12 10 15 17 9"/>
    </svg>
  );
}
