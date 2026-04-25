import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from "../../context/authService";
import { FormInput } from '../../components/ui/FormInput';
import styles from './Auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email'); return; }
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden="true"><div className={styles.bgOrb1} /><div className={styles.bgOrb2} /><div className={styles.bgGrid} /></div>
      <div className={styles.container}>
        <div className={styles.logoRow}><BusIcon /><span className={styles.logoText}>BusNirikshan</span></div>
        <div className={styles.card}>
          {sent ? (
            <div style={{textAlign:'center', padding:'16px 0'}}>
              <h2 className={styles.successTitle}>Check your inbox</h2>
              <p className={styles.successSubtitle}>Reset link sent to {email}</p>
              <Link to="/login" className={styles.switchLink} style={{marginTop:12,display:'block'}}>Back to sign in</Link>
            </div>
          ) : (
            <>
              <div className={styles.cardHeader}>
                <h1 className={styles.title}>Reset password</h1>
                <p className={styles.subtitle}>Enter your email and we'll send a reset link.</p>
              </div>
              <form onSubmit={handleSubmit} className={styles.form} noValidate>
                <FormInput label="Email address" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="you@example.com" error={error} autoComplete="email" />
                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className={styles.switchText}><Link to="/login" className={styles.switchLink}>← Back to sign in</Link></p>
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