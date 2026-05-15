import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

const RTC_OPTIONS = ['GSRTC','MSRTC','KSRTC','UPSRTC','RSRTC','TNSTC','TSRTC','PRTC','Other'];

const passwordRules = [
  { id: 'len',     label: 'At least 8 characters',  test: p => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter',    test: p => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter',    test: p => /[a-z]/.test(p) },
  { id: 'num',     label: 'One number',              test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character',   test: p => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const { registerInit, registerVerify } = useAuth();
  const navigate = useNavigate();

  // Step 1 form state
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'passenger', rtc: '' });
  const [errors, setErrors] = useState({});
  const [showStrength, setShowStrength] = useState(false);

  // Step 2 OTP state
  const [step, setStep] = useState(1); // 1 = form, 2 = OTP
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
    setServerError('');
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    else if (passwordRules.some(r => !r.test(form.password)))
      errs.password = 'Password does not meet all requirements';
    if (!form.rtc) errs.rtc = 'Please select your RTC';
    return errs;
  }

  // Step 1 — send OTP
  async function handleInitSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await registerInit(form);
      setStep(2); // move to OTP entry
    } catch (err) {
      setServerError(err.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  // Step 2 — verify OTP
  async function handleVerifySubmit(e) {
    e.preventDefault();
    if (!otp || otp.length !== 6) { setOtpError('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      await registerVerify(form.email, otp);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setOtpError(err.message || 'Invalid OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const passScore = form.password
    ? passwordRules.filter(r => r.test(form.password)).length
    : 0;

  // ── Success screen ──
  if (success) {
    return (
      <div className={styles.page}>
        <AuthBg />
        <div className={styles.container}>
          <LogoRow />
          <div className={`${styles.card} ${styles.successCard}`}>
            <CheckIcon />
            <h2 className={styles.successTitle}>Account created!</h2>
            <p className={styles.successSubtitle}>Redirecting you to sign in…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── OTP screen ──
  if (step === 2) {
    return (
      <div className={styles.page}>
        <AuthBg />
        <div className={styles.container}>
          <LogoRow />
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h1 className={styles.title}>Check your email</h1>
              <p className={styles.subtitle}>
                We sent a 6-digit code to <strong style={{ color: '#F0F4FF' }}>{form.email}</strong>.
                It expires in 10 minutes.
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

              {serverError && (
                <div className={styles.serverError}><span>{serverError}</span></div>
              )}

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & create account'}
              </button>

              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => { setStep(1); setOtp(''); setOtpError(''); }}
              >
                ← Back to edit details
              </button>
            </form>
          </div>

          <p className={styles.switchText}>
            Already have an account?{' '}
            <Link to="/login" className={styles.switchLink}>Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Step 1 — registration form ──
  return (
    <div className={styles.page}>
      <AuthBg />
      <div className={styles.container}>
        <LogoRow />
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Create account</h1>
            <p className={styles.subtitle}>Join the real-time bus tracking network.</p>
          </div>

          <form onSubmit={handleInitSubmit} className={styles.form} noValidate>
            <FormInput
              label="Full name"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ravi Kumar"
              error={errors.name}
              autoComplete="name"
            />

            <FormInput
              label="Email address"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              error={errors.email}
              autoComplete="email"
            />

            <div>
              <FormInput
                label="Password"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                onFocus={() => setShowStrength(true)}
                placeholder="Create a strong password"
                error={errors.password}
                autoComplete="new-password"
              />
              {showStrength && form.password && (
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
                      <div key={rule.id} className={`${styles.rule} ${rule.test(form.password) ? styles.rulePassed : ''}`}>
                        <span className={styles.ruleDot} />{rule.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.roleRow}>
              <label className={styles.roleLabel}>I am a</label>
              <div className={styles.rolePills}>
                {['passenger', 'driver'].map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.rolePill} ${form.role === r ? styles.roleActive : ''}`}
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.selectWrap}>
              <label className={styles.selectLabel}>Regional Transport Corporation</label>
              <div className={`${styles.selectBox} ${errors.rtc ? styles.selectError : ''}`}>
                <select name="rtc" value={form.rtc} onChange={handleChange} className={styles.select}>
                  <option value="">Select your RTC…</option>
                  {RTC_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {errors.rtc && <p className={styles.selectErrorMsg}>{errors.rtc}</p>}
            </div>

            {serverError && (
              <div className={styles.serverError}><span>{serverError}</span></div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Continue'}
            </button>
          </form>
        </div>

        <p className={styles.switchText}>
          Already have an account?{' '}
          <Link to="/login" className={styles.switchLink}>Sign in</Link>
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