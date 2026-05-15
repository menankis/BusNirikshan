import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

const passwordRules = [
  { id: 'len',     label: 'At least 8 characters',  test: p => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter',    test: p => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter',    test: p => /[a-z]/.test(p) },
  { id: 'num',     label: 'One number',              test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character',   test: p => /[^A-Za-z0-9]/.test(p) },
];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showStrength, setShowStrength] = useState(false);

  const passScore = password
    ? passwordRules.filter(r => r.test(password)).length
    : 0;

  function validate() {
    const errs = {};
    if (!password) errs.password = 'Password is required';
    else if (passwordRules.some(r => !r.test(password)))
      errs.password = 'Password does not meet all requirements';
    if (!confirmPassword) errs.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setServerError(err.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  // ── No token in URL ──
  if (!token) {
    return (
      <div className={styles.page}>
        <AuthBg />
        <div className={styles.container}>
          <LogoRow />
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h1 className={styles.title}>Invalid link</h1>
              <p className={styles.subtitle}>
                This reset link is missing or invalid.
                Request a new one below.
              </p>
            </div>
            <Link to="/forgot-password" className={styles.submitBtn}
              style={{ textAlign: 'center', marginTop: 8 }}>
              Request new link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <div className={styles.page}>
        <AuthBg />
        <div className={styles.container}>
          <LogoRow />
          <div className={`${styles.card} ${styles.successCard}`}>
            <CheckIcon />
            <h2 className={styles.successTitle}>Password reset!</h2>
            <p className={styles.successSubtitle}>
              Redirecting you to sign in…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className={styles.page}>
      <AuthBg />
      <div className={styles.container}>
        <LogoRow />
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Set new password</h1>
            <p className={styles.subtitle}>
              Choose a strong password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div>
              <FormInput
                label="New password"
                type="password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setErrors(er => ({ ...er, password: '' }));
                  setServerError('');
                }}
                onFocus={() => setShowStrength(true)}
                placeholder="Create a strong password"
                error={errors.password}
                autoComplete="new-password"
              />
              {showStrength && password && (
                <div className={styles.strengthBox}>
                  <div className={styles.strengthBar}>
                    {[1,2,3,4,5].map(i => (
                      <div
                        key={i}
                        className={styles.strengthSegment}
                        style={{
                          background: passScore >= i
                            ? passScore <= 2 ? '#EF4444'
                              : passScore === 3 ? '#FFD166'
                              : '#06D6A0'
                            : 'rgba(255,255,255,0.1)'
                        }}
                      />
                    ))}
                  </div>
                  <div className={styles.strengthRules}>
                    {passwordRules.map(rule => (
                      <div
                        key={rule.id}
                        className={`${styles.rule} ${rule.test(password) ? styles.rulePassed : ''}`}
                      >
                        <span className={styles.ruleDot} />{rule.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <FormInput
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={e => {
                setConfirmPassword(e.target.value);
                setErrors(er => ({ ...er, confirmPassword: '' }));
              }}
              placeholder="Repeat your new password"
              error={errors.confirmPassword}
              autoComplete="new-password"
            />

            {serverError && (
              <div className={styles.serverError}>
                <span>{serverError}</span>
              </div>
            )}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        </div>

        <p className={styles.switchText}>
          <Link to="/login" className={styles.switchLink}>← Back to sign in</Link>
        </p>
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
        <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z"
          fill="white" fillOpacity="0.95"/>
        <rect x="7" y="20" width="18" height="4" rx="1"
          fill="white" fillOpacity="0.8"/>
        <circle cx="11" cy="24" r="2" fill="#FF6B2C"/>
        <circle cx="21" cy="24" r="2" fill="#FF6B2C"/>
      </svg>
      <span className={styles.logoText}>BusNirikshan</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
      stroke="#06D6A0" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="7 12 10 15 17 9"/>
    </svg>
  );
}