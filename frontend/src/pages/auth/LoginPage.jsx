import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
    setServerError('');
  }

  function validate() {
    const errs = {};
    if (!form.email) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email';
    if (!form.password) errs.password = 'Password is required';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setServerError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.bgOrb1} /><div className={styles.bgOrb2} /><div className={styles.bgGrid} />
      </div>
      <div className={styles.container}>
        <div className={styles.logoRow}>
          <BusIcon /><span className={styles.logoText}>BusNirikshan</span>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Track buses in real time. Sign in to continue.</p>
          </div>
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <FormInput label="Email address" type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" error={errors.email} icon={<MailIcon />} autoComplete="email" />
            <FormInput label="Password" type="password" name="password" value={form.password} onChange={handleChange} placeholder="Enter your password" error={errors.password} autoComplete="current-password" />
            <div className={styles.forgotRow}>
              <Link to="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
            </div>
            {serverError && (
              <div className={styles.serverError}>
                <span>{serverError}</span>
              </div>
            )}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className={styles.switchText}>
          Don't have an account? <Link to="/register" className={styles.switchLink}>Create one</Link>
        </p>
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

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}