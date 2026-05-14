import { useEffect, useRef, useState } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function useSSE(busId) {
  const [location, setLocation] = useState(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    if (!busId) return;
    const token = localStorage.getItem('busnirikshan_token');
    const url = `${BASE_URL}/api/location/sse/${busId}${token ? `?token=${token}` : ''}`;

    esRef.current = new EventSource(url);

    esRef.current.onopen = () => setConnected(true);

    esRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLocation(data);
      } catch {}
    };

    esRef.current.onerror = () => {
      setConnected(false);
      esRef.current?.close();
    };

    return () => {
      esRef.current?.close();
      setConnected(false);
    };
  }, [busId]);

  return { location, connected };
}