import styles from './BusCard.module.css';

export function BusCard({ bus, location, eta, isSelected, onClick }) {
  const isLive = location && (Date.now() - (location.timestamp || 0)) < 120000;

  return (
    <div className={`${styles.card} ${isSelected ? styles.selected : ''}`} onClick={onClick}>
      <div className={styles.header}>
        <div className={styles.busInfo}>
          <span className={styles.busNumber}>{bus.busNumber || bus.registrationNumber || 'BUS-' + String(bus._id).slice(-4)}</span>
          {isLive && <span className={styles.liveDot} title="Live tracking active" />}
        </div>
        {eta != null && (
          <div className={styles.etaBadge}>
            <ClockIcon />
            <span>{Math.round(eta.minutes ?? eta)} min</span>
          </div>
        )}
      </div>

      <div className={styles.route}>
        <MapPinIcon />
        <span>{bus.route?.name || bus.routeName || 'Route info unavailable'}</span>
      </div>

      <div className={styles.footer}>
        {location ? (
          <>
            <span className={styles.footerItem}>
              <SpeedIcon />
              {Math.round(location.speed || 0)} km/h
            </span>
            <span className={`${styles.footerItem} ${isLive ? styles.live : ''}`}>
              <SignalIcon />
              {isLive ? 'Live' : 'Last ' + timeAgo(location.timestamp)}
            </span>
          </>
        ) : (
          <span className={styles.noLocation}>Location unavailable</span>
        )}
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return 'unknown';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function ClockIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function MapPinIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function SpeedIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/><path d="M20.9 12a8.9 8.9 0 1 0-17.8 0"/><path d="M16.7 7.3l-4.5 4.5"/></svg>;
}
function SignalIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="6" x2="1" y2="18"/><line x1="6" y1="10" x2="6" y2="18"/><line x1="11" y1="14" x2="11" y2="18"/><line x1="16" y1="4" x2="16" y2="18"/><line x1="21" y1="8" x2="21" y2="18"/></svg>;
}