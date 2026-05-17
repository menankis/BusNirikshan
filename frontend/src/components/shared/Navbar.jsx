import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import styles from './Navbar.module.css';

export function Navbar({ role }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <BusLogo />
        <span className={styles.brand}>BusNirikshan</span>
        <span className={`${styles.roleBadge} ${styles[role]}`}>
          {role === 'driver' ? 'Driver' : 'Passenger'}
        </span>
      </div>

      <div className={styles.right}>
        <div className={styles.userBtn} onClick={() => setMenuOpen(v => !v)}>
          <div className={styles.avatar}>
            {(user?.name || user?.email || 'U')[0].toUpperCase()}
          </div>
          <span className={styles.userName}>{user?.name || user?.email}</span>
          <ChevronIcon />
        </div>

        {menuOpen && (
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>
              <p className={styles.dropName}>{user?.name || 'User'}</p>
              <p className={styles.dropEmail}>{user?.email}</p>
            </div>
            <hr className={styles.dropDivider} />
            <button className={styles.dropItem} onClick={logout}>
              <LogoutIcon /> Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

function BusLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="9" fill="#FF6B2C"/>
      <path d="M7 10C7 8.9 7.9 8 9 8H23C24.1 8 25 8.9 25 10V20H7V10Z" fill="white" fillOpacity="0.95"/>
      <rect x="7" y="20" width="18" height="4" rx="1" fill="white" fillOpacity="0.8"/>
      <circle cx="11" cy="24" r="2" fill="#FF6B2C"/>
      <circle cx="21" cy="24" r="2" fill="#FF6B2C"/>
      <rect x="10" y="11" width="5" height="4" rx="1" fill="#FF6B2C" fillOpacity="0.6"/>
      <rect x="17" y="11" width="5" height="4" rx="1" fill="#FF6B2C" fillOpacity="0.6"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}