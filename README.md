# BusNirikshan

Passengers track buses on a live map. Drivers update location every 30 sec via a simple mobile form. Passengers see arrival time estimates for their stop.

## Group 2:
- Menanki Shekhawat(2023BTECH048)
- Maulik Sharma(2023BTECH047)
- Shubham Jain(2023BTECH079)
- Pakhi Sharma(2023BTECH055)

## Deployed At:
- Frontend: https://busnirikshan.mauliksharma.org
- Backend: https://busnirikshanapi.mauliksharma.org

## Key Features & Architecture

### 1. Real-Time Tracking & Synchronization
- **WebSocket + Redis Pub/Sub**: Driver updates location → POST to server → server publishes to Redis channel `bus:{busId}` → all Node instances push updates to connected clients. Implements canonical multi-instance WebSocket pattern.
- **GeoJSON & Geospatial Queries**: Backend uses MongoDB `2dsphere` indexes to efficiently query nearby buses and stops.
- **ETA Computation**: Haversine formula calculates live ETA in pure JS on the server based on GPS distance and estimated speeds.

### 2. Robust Security & Authentication
- **Email OTP Verification**: Registration requires a 6-digit OTP sent via email (Nodemailer), preventing spam and verifying real users.
- **Identity-Keyed Rate Limiting**: API throttling uses `userId` or `email` instead of just IP addresses, allowing fair use across CGNAT networks (e.g., universities or cellular).
- **JWT & Multi-Session Management**: Secure authentication with `access_token` (15m, stateless) and `refresh_token` (7d, HttpOnly cookie, stored in DB). Users can manage multiple sessions and utilize global logout (`/logout-all`).
- **Role-Based Access Control (RBAC)**: Distinct permissions for `user`, `driver`, and `admin` roles, properly enforced at the routing level.

### 3. Data Integrity & Codebase Organization
- **Strict Schema Validation**: Uses MongoDB ObjectIds for relational integrity between Buses, Stops, and Locations.
- **Centralized Utilities**: Modular separation of utilities (geolocation, validation, mailing, pagination).

### 4. CI/CD & Deployment
- **Automated Docker Hub Deployments**: GitHub Actions workflows automatically build and publish separate Docker images for the frontend and backend whenever code is pushed to the `main` branch.

## Deliverables
| Tech Concept | What Students Must Implement | 
|---|---|
| WebSocket + Redis Pub/Sub | Driver updates location → POST to server → server publishes to Redis channel `bus:{busId}` → all Node instances push update to connected clients. |
| MongoDB Time-Series for History | GPS updates stored in a time-series collection. Schema designed for efficient range queries ('show bus path for last 2 hours'). |
| Server-Side ETA Computation | ETA computed using the Haversine formula in pure JS on the server. |
| useMemo for Nearby Buses | List of buses near a given stop computed from the live location feed using `useMemo` in React. |
| Polling vs SSE vs WebSocket | Students implement all three approaches, benchmark latency and server load, and compare them. |
| Horizontal Scaling Proof | Verify that a location update from a driver on Node Instance A reaches a passenger connected to Node Instance B via Redis. |

## API Documentation

### Authentication (`/api/auth`)

#### 1. Initialize Registration (Send OTP)
- **Endpoint**: `POST /api/auth/register/init`
- **Body**: 
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123!",
    "role": "passenger",
    "rtc": "GSRTC"
  }
  ```
- **Responses**:
  - `200 OK`: OTP sent to email.
  - `400 Bad Request`: Validation failure or user already exists.

#### 2. Verify Registration
- **Endpoint**: `POST /api/auth/register/verify`
- **Body**:
  ```json
  {
    "email": "jane@example.com",
    "otp": "123456"
  }
  ```
- **Responses**:
  - `201 Created`: Registration successful.
  - `400 Bad Request`: Invalid OTP, expired, or already used.

#### 3. Login
- **Endpoint**: `POST /api/auth/login`
- **Body**: 
  ```json
  {
    "email": "jane@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Responses**:
  - `200 OK`: Login successful. Returns `access_token` and sets an `HttpOnly` cookie for `refresh_token`.
  - `401 Unauthorized`: Invalid credentials.

#### 4. Logout
- **Endpoint**: `POST /api/auth/logout`
- **Responses**:
  - `200 OK`: Logout successful for the current device.

#### 5. Logout All Devices
- **Endpoint**: `POST /api/auth/logout-all`
- **Responses**:
  - `200 OK`: Logs out all active sessions for the user globally.

#### 6. Refresh Token
- **Endpoint**: `POST /api/auth/refresh`
- **Responses**:
  - `200 OK`: Returns new `access_token` and rotates `refresh_token`.
  - `403 Forbidden`: Invalid or expired refresh token. 

#### 7. Forgot Password
- **Endpoint**: `POST /api/auth/forgot-password`
- **Responses**:
  - `200 OK`: Password reset link sent (if user exists).

#### 8. Reset Password
- **Endpoint**: `POST /api/auth/reset-password`
- **Body**:
  ```json
  {
    "token": "...",
    "newPassword": "NewStrongPassword123!"
  }
  ```
- **Responses**:
  - `200 OK`: Password reset successful, revokes all active sessions.

### User (`/api/user`)

#### 1. Get Profile
- **Endpoint**: `GET /api/user/:userId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Fetches a user's profile. Users can only view their own profile unless they have the `admin` role.

#### 2. Update Profile
- **Endpoint**: `PATCH /api/user/:userId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Updates user fields. Users can update their own profile; `admin` can update any profile. Only admins can update `role` and `isActive` fields.
- **Body**: (All fields optional)
  ```json
  {
    "name": "Jane Updated",
    "email": "jane_new@example.com",
    "role": "driver",
    "rtc": "GSRTC"
  }
  ```

#### 3. Delete Profile
- **Endpoint**: `DELETE /api/user/:userId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Deletes a profile and triggers a cascade delete of related session refresh tokens and password reset tokens. Requires ownership or `admin` role.

### Stops (`/api/stops`)

#### 1. Get Stops
- **Endpoint**: `GET /api/stops/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Query Parameters**:
  - `city` (string): Filter by city.
  - `rtc` (string/array): Filter by one or more RTC operators.
  - `page`, `limit` (numbers): Pagination controls.

#### 2. Get Nearby Stops
- **Endpoint**: `GET /api/stops/nearby`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Query Parameters**: 
  - `latitude`, `longitude` (numbers, required): Center point.
  - `radius` (number, optional): Search radius in meters (default: 5000).

#### 3. Get Stop by ID
- **Endpoint**: `GET /api/stops/:stopId`
- **Headers Required**: `Authorization: Bearer <access_token>`

#### 4. Create Stop
- **Endpoint**: `POST /api/stops/`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**:
  ```json
  {
    "name": "Dadar Station",
    "city": "Mumbai",
    "state": "Maharashtra",
    "rtc": ["MSRTC"],
    "latitude": 19.0193,
    "longitude": 72.8439
  }
  ```

#### 5. Update Stop
- **Endpoint**: `PATCH /api/stops/:stopId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**: Allows updating any fields provided in the creation payload.

#### 6. Delete Stop
- **Endpoint**: `DELETE /api/stops/:stopId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)

#### 7. Get Buses Approaching Stop
- **Endpoint**: `GET /api/stops/:stopId/buses`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Fetches all active buses running on routes that serve the specified stop, along with their live distance and estimated time of arrival (ETA).

### Buses (`/api/buses`)

#### 1. Get Buses
- **Endpoint**: `GET /api/buses/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Query Parameters**: 
  - `rtc` (string/array): Filter by RTC operator.
  - `isActive` (boolean): Filter active or inactive buses.
  - `page`, `limit` (numbers): Pagination controls.

#### 2. Get Bus by ID
- **Endpoint**: `GET /api/buses/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>`

#### 3. Create Bus
- **Endpoint**: `POST /api/buses/`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**:
  ```json
  {
    "routeId": "route_object_id",
    "rtc": "GSRTC",
    "routeName": "Ahmedabad-Surat",
    "registrationNumber": "GJ01-AB-1234",
    "capacity": 50,
    "isActive": true
  }
  ```

#### 4. Update Bus
- **Endpoint**: `PATCH /api/buses/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**: Allows updating any fields provided in the creation payload, plus manual location overrides (`latitude`, `longitude`, `speed_kmh`, `heading_deg`).

#### 5. Delete Bus
- **Endpoint**: `DELETE /api/buses/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)

#### 6. Get Bus Status
- **Endpoint**: `GET /api/buses/:busId/status`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Returns the active state and last known location of a single bus in near real-time.

#### 7. Get Bus History
- **Endpoint**: `GET /api/buses/:busId/history`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Fetches the location history log of a specific bus.
- **Query Parameters**: 
  - `from`, `to` (numbers, required): Epoch timestamps defining the time window.
  - `page`, `limit` (numbers): Pagination controls (up to 500 per page).

#### 8. Get Bus ETA
- **Endpoint**: `GET /api/buses/:busId/eta`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Calculates the live ETA of a bus to a specific stop.
- **Query Parameters**: 
  - `stopId` (string, required): The target stop ID.

### Routes (`/api/routes`)

#### 1. Get Routes
- **Endpoint**: `GET /api/routes/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Query Parameters**: 
  - `rtc` (string/array): Filter by RTC operator.
  - `isActive` (boolean): Filter active or inactive routes.
  - `stopId` (string): Filter routes passing through a specific stop.
  - `page`, `limit` (numbers): Pagination controls.

#### 2. Get Route by ID
- **Endpoint**: `GET /api/routes/:routeId`
- **Headers Required**: `Authorization: Bearer <access_token>`

#### 3. Create Route
- **Endpoint**: `POST /api/routes/`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**:
  ```json
  {
    "name": "Mumbai-Pune Express",
    "rtc": "MSRTC",
    "stopIds": ["stop_object_id_1", "stop_object_id_2"],
    "totalDistanceKm": 150.5,
    "estimatedDurationMin": 180,
    "isActive": true
  }
  ```

#### 4. Update Route
- **Endpoint**: `PATCH /api/routes/:routeId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)
- **Body**: Allows updating any fields provided in the creation payload.

#### 5. Delete Route
- **Endpoint**: `DELETE /api/routes/:routeId`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `admin`)

#### 6. Get Buses on Route
- **Endpoint**: `GET /api/routes/:routeId/buses`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Fetches all active buses currently assigned to a specific route.

### Locations (`/api/locations`)

#### 1. Submit Location Update
- **Endpoint**: `POST /api/locations/`
- **Headers Required**: `Authorization: Bearer <access_token>` (Role: `driver`)
- **Description**: Driver submits real-time GPS update. Publishes to Redis channel via Pub/Sub.
- **Body**:
  ```json
  {
    "lat": 19.0193,
    "lng": 72.8439,
    "speed_kmh": 45,
    "heading_deg": 180,
    "timestamp": 1714812345000
  }
  ```

#### 2. Get Live Locations (All Buses)
- **Endpoint**: `GET /api/locations/live`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Query Parameters**: 
  - `lat`, `lng` (numbers): Center point for bounding query. Required together.
  - `radius` (number): Search radius in km (default: 10).
  - `rtc` (string/array): Filter by operator.
  - `routeId` (string): Filter by route.
  - `limit` (number): Max results to return.

#### 3. Get Live Location (Single Bus)
- **Endpoint**: `GET /api/locations/live/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>`

### WebSockets (`ws://...`)

#### 1. Real-Time Location Feed
- **Endpoint**: `ws://<host>/api/locations/livewebsocket`
- **Headers Required**: Connection requires authentication via `Authorization: Bearer <access_token>` in the initial handshake headers (or cookies, depending on the client).
- **Description**: Upgrades the connection to a WebSocket for real-time location streaming. The server uses Redis Pub/Sub behind the scenes to push events across all Node instances to connected clients.
- **Client Protocol (JSON)**:
  - **Subscribe** (up to 50 buses per connection):
    ```json
    { "type": "subscribe", "busIds": ["bus_id_1", "bus_id_2"] }
    ```
  - **Unsubscribe**:
    ```json
    { "type": "unsubscribe", "busIds": ["bus_id_1"] }
    ```
- **Server Push Messages**:
  - **Location Update** (fired when a driver submits a new GPS coordinate):
    ```json
    {
      "type": "location",
      "busId": "bus_id_1",
      "latitude": 19.0193,
      "longitude": 72.8439,
      "speed_kmh": 45,
      "heading_deg": 180
    }
    ```
  - **Acknowledgements & Errors**:
    ```json
    { "type": "ack", "action": "subscribed", "busIds": ["bus_id_1"] }
    ```
    ```json
    { "type": "error", "message": "Subscription limit reached (max 50 buses per connection)" }
    ```


## API Endpoint to be Implemented

---

### 👨‍✈️ Drivers

| Method | Endpoint | Description | Body / Params |
|--------|----------|-------------|---------------|
| GET | `/api/drivers` | List all drivers (admin only) | `?rtc=RSRTC&isActive=true` |
| GET | `/api/drivers/:driverId` | Get a driver's profile and assigned bus | — |
| POST | `/api/drivers` | Register a driver (admin only) | `{ userId, rtc, licenseNumber }` |
| PATCH | `/api/drivers/:driverId` | Update driver's assigned bus or status | `{ busId?, isActive? }` |
| DELETE | `/api/drivers/:driverId` | Remove a driver (admin only) | — |
| POST | `/api/drivers/:driverId/shift/start` | Driver starts a shift, activates bus on map | `{ busId }` |
| POST | `/api/drivers/:driverId/shift/end` | Driver ends shift, deactivates bus on map | — |

---

### ⏱️ ETA

| Method | Endpoint | Description | Body / Params |
|--------|----------|-------------|---------------|
| GET | `/api/eta` | Compute ETA for multiple buses to one stop | `?stopId=STOP-001&busIds=GJ01-1234,GJ01-5678` |
| GET | `/api/eta/stop/:stopId` | Get ETAs for all approaching buses to a stop | `?radius_km=10` |

---

### 📊 Analytics / History (Admin & Dev)

| Method | Endpoint | Description | Body / Params |
|--------|----------|-------------|---------------|
| GET | `/api/analytics/bus/:busId/trail` | Full GPS trail for a bus over a date range | `?from=<epoch>&to=<epoch>` |
| GET | `/api/analytics/bus/:busId/speed` | Average speed per hour for a bus | `?date=2026-04-13` |
| GET | `/api/analytics/stops/:stopId/traffic` | How many buses passed a stop per hour | `?date=2026-04-13` |
| GET | `/api/analytics/system/active-buses` | Count of currently active buses across all RTCs | — |

---

### 🔔 Notifications (Stretch Goal)

| Method | Endpoint | Description | Body / Params |
|--------|----------|-------------|---------------|
| POST | `/api/notifications/subscribe` | Passenger subscribes to alerts for a stop + route | `{ stopId, routeId, thresholdMinutes: 5 }` |
| DELETE | `/api/notifications/subscribe` | Unsubscribe from alerts | `{ stopId, routeId }` |
| GET | `/api/notifications` | List a passenger's active subscriptions | — |

---

### 🛠️ Admin

| Method | Endpoint | Description | Body / Params |
|--------|----------|-------------|---------------|
| GET | `/api/admin/users` | List all users with roles | `?role=driver&page=1` |
| PATCH | `/api/admin/users/:userId/role` | Change a user's role | `{ role: "admin"\|"driver"\|"passenger" }` |
| GET | `/api/admin/system/health` | Server health check (Redis, MongoDB, Node instances) | — |
| GET | `/api/admin/system/instances` | List active Node instances registered with Redis | — |

---

### SSE

| SSE | `/api/locations/livesse` | Alternative SSE feed of all bus location updates (benchmark use) |

---

### Summary Count

| Category | Count |
|----------|-------|
| Auth | 7 |
| Users | 3 |
| Buses | 8 |
| Location | 3 |
| Stops | 7 |
| Routes | 6 |
| Drivers | 7 |
| ETA | 2 |
| Analytics | 4 |
| Notifications | 3 |
| Admin | 4 |
| Real-Time (WS/SSE) | 3 |
| **Total** | **57** |