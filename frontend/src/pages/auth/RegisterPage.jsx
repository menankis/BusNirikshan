import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

const RTC_OPTIONS = ['GSRTC','MSRTC','KSRTC','UPSRTC','RSRTC','TNSTC','TSRTC','PRTC','Other'];

const passwordRules = [
  { id: 'len', label: 'At least 8 characters', test: p => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: p => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: p => /[a-z]/.test(p) },
  { id: 'num', label: 'One number', test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character', test: p => /[^A-Za-z0-9]/.test(p) },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'passenger', rtc: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showStrength, setShowStrength] = useState(false);

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
    else if (passwordRules.filter(r => !r.test(form.password)).length)
      errs.password = 'Password does not meet requirements';
    if (!form.rtc) errs.rtc = 'Please select your RTC';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await register(form);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setServerError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const passScore = form.password ? passwordRules.filter(r => r.test(form.password)).length : 0;

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.bg} aria-hidden="true"><div className={styles.bgOrb1} /><div className={styles.bgOrb2} /><div className={styles.bgGrid} /></div>
        <div className={styles.container}>
          <div className={styles.logoRow}><BusIcon /><span className={styles.logoText}>BusNirikshan</span></div>
          <div className={`${styles.card} ${styles.successCard}`}>
            <h2 className={styles.successTitle}>You're registered!</h2>
            <p className={styles.successSubtitle}>Redirecting you to sign in…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.bgOrb1} /><div className={styles.bgOrb2} /><div className={styles.bgGrid} />
      </div>
      <div className={styles.container}>
        <div className={styles.logoRow}><BusIcon /><span className={styles.logoText}>BusNirikshan</span></div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Create account</h1>
            <p className={styles.subtitle}>Join the real-time bus tracking network.</p>
          </div>
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <FormInput label="Full name" type="text" name="name" value={form.name} onChange={handleChange} placeholder="Ravi Kumar" error={errors.name} autoComplete="name" />
            <FormInput label="Email address" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" error={errors.email} autoComplete="email" />
            <div>
              <FormInput label="Password" type="password" name="password" value={form.password} onChange={handleChange} onFocus={() => setShowStrength(true)} placeholder="Create a strong password" error={errors.password} autoComplete="new-password" />
              {showStrength && form.password && (
                <div className={styles.strengthBox}>
                  <div className={styles.strengthBar}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`${styles.strengthSegment} ${passScore >= i ? styles[`strength${Math.min(Math.ceil(passScore/1.5),5)}`] : ''}`} />
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
                {['passenger','driver'].map(r => (
                  <button key={r} type="button" className={`${styles.rolePill} ${form.role === r ? styles.roleActive : ''}`} onClick={() => setForm(f => ({ ...f, role: r }))}>
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
            {serverError && <div className={styles.serverError}><span>{serverError}</span></div>}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
        <p className={styles.switchText}>Already have an account? <Link to="/login" className={styles.switchLink}>Sign in</Link></p>
      </div>
    </div>
  );
}

function BusIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="10" fill="var(--brand-orange)" />
      <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z" fill="white" fillOpacity="0.95"/>
      <rect x="7" y="20" width="18" height="4" rx="1" fill="white" fillOpacity="0.8"/>
      <circle cx="11" cy="24" r="2" fill="var(--brand-orange)"/>
      <circle cx="21" cy="24" r="2" fill="var(--brand-orange)"/>
    </svg>
  );
}