import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000'

export function useWebSocket() {
  const ws = useRef(null)
  const [busLocations, setBusLocations] = useState({})
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)
  const listeners = useRef({})

  const connect = useCallback(() => {
    const token = localStorage.getItem('busnirikshan_token')
    const url = token
      ? `${WS_URL}/api/locations/livewebsocket?token=${token}`
      : `${WS_URL}/api/locations/livewebsocket`

    try {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        setConnected(true)
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      }

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'location_update' || msg.type === 'bus_location') {
            const { busId, latitude, longitude, heading, speed, timestamp } = msg.data || msg
            setBusLocations(prev => ({
              ...prev,
              [busId]: { busId, latitude, longitude, heading, speed, timestamp: timestamp || Date.now() },
            }))
            if (listeners.current[busId]) {
              listeners.current[busId].forEach(cb => cb({ busId, latitude, longitude, heading, speed }))
            }
          }
        } catch (e) {}
      }

      ws.current.onclose = () => {
        setConnected(false)
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.current.onerror = () => {
        ws.current?.close()
      }
    } catch (e) {
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect])

  const sendLocation = useCallback((busId, latitude, longitude, heading) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'location_update',
        busId, latitude, longitude, heading, timestamp: Date.now(),
      }))
      return true
    }
    return false
  }, [])

  return { busLocations, connected, sendLocation }
}