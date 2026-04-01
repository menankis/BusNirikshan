# 15. BusNirikshan
Passengers track buses on a live map. Drivers update location every 30 sec. via a simple mobile form. Passengers see arrival time estimates for their stop.

## Group 2:
- Menanki Shekhawat(2023BTECH048)
- Maulik Sharma(2023BTECH049)
- Shubham Jain(2023BTECH079)
- Pakhi Sharma(2023BTECH055)

##  Deliverables
| Tech Concept | What Students Must Implement | 
|---|---|
| WebSocket + Redis Pub/Sub | Driver updates location → POST to server → server publishes to Redis channel bus:{busId} → all Node instances push update to connected clients. The canonical multi-instance WebSocket pattern. |
| MongoDB Time-Series for History | GPS updates stored in a time-series collection. Students design the schema for efficient range queries ('show bus path for last 2 hours') and explain why a regular collection is slower. |
| Server-Side ETA Computation | ETA computed using the Haversine formula in pure JS on the server — fast, no worker thread needed. Students understand when to use worker threads vs when pure JS is sufficient. |
| useMemo for Nearby Buses | List of buses near a given stop computed from the live location feed using useMemo. Re-computed only when the location data changes, not on every socket message. |
| Polling vs SSE vs WebSocket | Students implement all three approaches, benchmark latency and server load, and write a comparison report justifying the final WebSocket choice. |
| Horizontal Scaling Proof | Students run two Node instances behind a simple nginx proxy and verify that a location update from a driver connected to instance A reaches a passenger on instance B. |

## Concepts Covered
- Redis Pub/Sub (Load Sharing)
- useMemo / useCallback Optimizations
- WebSockets / SSE
- Geospatial Queries (2dsphere)
- Load Testing & Horizontal Scaling
