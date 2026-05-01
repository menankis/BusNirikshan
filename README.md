# 15. BusNirikshan
Passengers track buses on a live map. Drivers update location every 30 sec. via a simple mobile form. Passengers see arrival time estimates for their stop.

## Group 2:
- Menanki Shekhawat(2023BTECH048)
- Maulik Sharma(2023BTECH047)
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

## API Documentation

### Authentication (`/api/auth`)

#### 1. Register a new user
- **Endpoint**: `POST /api/auth/register`
- **Body**: 
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123!",
    "role": "passenger",
    "rtc": "example_rtc"
  }
  ```
- **Responses**:
  - `201 Created`: User successfully registered.
  - `400 Bad Request`: User already exists or password doesn't meet security requirements (must be >8 chars, include uppercase, lowercase, number, and special character).
  - `500 Internal Server Error`: Generic server error.

#### 2. Login
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
  - `400 Bad Request`: Email and password are required.
  - `401 Unauthorized`: Invalid username or password.
  - `500 Internal Server Error`: Generic server error.

#### 3. Logout
- **Endpoint**: `POST /api/auth/logout`
- **Cookies Required**: `refresh_token`
- **Responses**:
  - `200 OK`: Logout successful. Deletes the refresh token from the database and clears the HTTP cookie.
  - `401 Unauthorized`: No refresh token found.
  - `500 Internal Server Error`: Generic server error.

#### 4. Refresh Token
- **Endpoint**: `POST /api/auth/refresh`
- **Cookies Required**: `refresh_token`
- **Responses**:
  - `200 OK`: Token refreshed successfully. Returns a new `access_token` and updates the `HttpOnly` cookie with a new `refresh_token`.
  - `401 Unauthorized`: No refresh token found.
  - `403 Forbidden`: Invalid or expired refresh token. 
  - `500 Internal Server Error`: Generic server error.

#### 5. Forgot Password
- **Endpoint**: `POST /api/auth/forgot-password`
- **Body**:
  ```json
  {
    "email": "jane@example.com"
  }
  ```
- **Responses**:
  - `200 OK`: Password reset link sent to your email.
  - `400 Bad Request`: Email is required.
  - `404 Not Found`: User not found.
  - `500 Internal Server Error`: Generic server error.

#### 6. Reset Password
- **Endpoint**: `POST /api/auth/reset-password`
- **Body**:
  ```json
  {
    "token": "token_received_in_email",
    "newPassword": "NewStrongPassword123!"
  }
  ```
- **Responses**:
  - `200 OK`: Password reset successful.
  - `400 Bad Request`: New password does not meet security requirements or is the same as the old password.
  - `403 Forbidden`: Invalid or expired reset token, or user not found.
  - `500 Internal Server Error`: Generic server error.

### User (`/api/user`)

#### 1. Get Public Profile
- **Endpoint**: `GET /api/user/:userId`
- **Description**: Fetches the public profile data of a specific user.
- **Responses**:
  - `200 OK`: Profile fetched successfully. Returns public-facing information including `name`, `role`, `rtc`, and `createdAt` (excludes sensitive fields like `passwordHash`).
  - `404 Not Found`: User not found.
  - `500 Internal Server Error`: Generic server error.

#### 2. Update Profile
- **Endpoint**: `PATCH /api/user/:userId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Updates fields for a specific user. Replaces provided fields (`name`, `email`, `role`, `rtc`, `isActive`, `password`). Hashing is applied to any new password. Users can only update their own profile; admins can update any profile.
- **Body**: (All fields are optional; include only what needs updating)
  ```json
  {
    "name": "Jane Updated",
    "email": "jane_new@example.com",
    "role": "driver",
    "rtc": "GSRTC",
    "isActive": true,
    "password": "NewPassword123!"
  }
  ```
- **Responses**:
  - `200 OK`: User updated successfully. Returns the updated user document (excluding passwordHash).
  - `400 Bad Request`: No valid fields provided for update.
  - `403 Forbidden`: Not allowed to update this profile (ownership or admin check failed) or invalid token.
  - `404 Not Found`: User not found.
  - `409 Conflict`: Email already in use by another user.
  - `500 Internal Server Error`: Generic server error.

#### 3. Delete Profile
- **Endpoint**: `DELETE /api/user/:userId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Deletes a user profile by ID. Additionally executes a cascading delete to scrub out any affiliated session refresh tokens and password reset tokens in order to prevent ghost sessions. Users can only delete their own profile; admins can delete any.
- **Responses**:
  - `200 OK`: User deleted successfully.
  - `403 Forbidden`: Not allowed to delete this profile (ownership or admin check failed) or invalid token.
  - `404 Not Found`: User not found.
  - `500 Internal Server Error`: Generic server error.

### Stops (`/api/stops`)

#### 1. Get Stops
- **Endpoint**: `GET /api/stops/`
- **Description**: Fetches all stops. Optionally filters by `city` and `rtc`.
- **Query Parameters**:
  - `city` (string): Exact match for city.
  - `rtc` (string or array): Returns stops matching any of the provided RTCs.
- **Responses**:
  - `200 OK`: Stops fetched successfully. Returns an array of stops.
  - `500 Internal Server Error`: Generic server error.

#### 2. Get Nearby Stops
- **Endpoint**: `GET /api/stops/nearby`
- **Description**: Fetches stops near a specific coordinate, sorted by distance.
- **Query Parameters**:
  - `latitude` (number, required)
  - `longitude` (number, required)
  - `radius` (number, optional): Maximum search radius in meters (defaults to 5000).
- **Responses**:
  - `200 OK`: Nearby stops fetched successfully. Returns an array of stops.
  - `400 Bad Request`: Missing latitude or longitude.
  - `500 Internal Server Error`: Generic server error.

#### 3. Get Stop by ID
- **Endpoint**: `GET /api/stops/:stopId`
- **Description**: Fetches a specific stop by its ID.
- **Responses**:
  - `200 OK`: Stop fetched successfully.
  - `404 Not Found`: Stop not found.
  - `500 Internal Server Error`: Generic server error.

#### 4. Create Stop
- **Endpoint**: `POST /api/stops/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Creates a new stop. Requires `admin` role.
- **Body**: 
  ```json
  {
    "name": "Dadar Station",
    "city": "Mumbai",
    "state": "Maharashtra",
    "rtc": ["MSRTC", "GSRTC"],
    "latitude": 19.0193,
    "longitude": 72.8439
  }
  ```
  *(Note: You can also pass a full GeoJSON `location` object instead of `latitude` and `longitude`)*
- **Responses**:
  - `201 Created`: Stop created successfully.
  - `400 Bad Request`: Missing required fields.
  - `403 Forbidden`: Not allowed to create stops (not an admin).
  - `500 Internal Server Error`: Generic server error.

#### 5. Update Stop
- **Endpoint**: `PATCH /api/stops/:stopId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Updates specific fields of an existing stop. Requires `admin` role.
- **Body**: (All fields optional)
  ```json
  {
    "isActive": false,
    "rtc": ["MSRTC"]
  }
  ```
- **Responses**:
  - `200 OK`: Stop updated successfully.
  - `400 Bad Request`: No fields provided for update.
  - `403 Forbidden`: Not allowed to update stops (not an admin).
  - `404 Not Found`: Stop not found.
  - `500 Internal Server Error`: Generic server error.

#### 6. Delete Stop
- **Endpoint**: `DELETE /api/stops/:stopId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Deletes a stop by ID. Requires `admin` role.
- **Responses**:
  - `200 OK`: Stop deleted successfully.
  - `403 Forbidden`: Not allowed to delete stops (not an admin).
  - `404 Not Found`: Stop not found.
  - `500 Internal Server Error`: Generic server error.

#### 7. Get Buses for a Stop
- **Endpoint**: `GET /api/stops/:stopId/buses`
- **Description**: Fetches all active buses running on routes serving the specified stop, along with ETA and distance.
- **Responses**:
  - `200 OK`: Buses fetched successfully.
  - `404 Not Found`: Stop not found.
  - `409 Conflict`: Stop has no location data.
  - `500 Internal Server Error`: Generic server error.

### Buses (`/api/buses`)

#### 1. Get Buses
- **Endpoint**: `GET /api/buses/`
- **Description**: Fetches a paginated list of buses. Can filter by `rtc` and `isActive`.
- **Query Parameters**:
  - `rtc` (string/array): Filter by one or more RTCs.
  - `isActive` (boolean): Filter active or inactive buses.
  - `page` (number): Page number (default: 1).
  - `limit` (number): Results per page (default: 20).
- **Responses**:
  - `200 OK`: Buses fetched successfully with pagination info.
  - `400 Bad Request`: Invalid filter parameters.
  - `500 Internal Server Error`: Generic server error.

#### 2. Get Bus by ID
- **Endpoint**: `GET /api/buses/:busId`
- **Description**: Fetches a specific bus by ID.
- **Responses**:
  - `200 OK`: Bus fetched successfully.
  - `404 Not Found`: Bus not found.
  - `500 Internal Server Error`: Generic server error.

#### 3. Create Bus
- **Endpoint**: `POST /api/buses/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Creates a new bus. Requires `admin` role.
- **Body**:
  ```json
  {
    "registrationNumber": "GJ01-AB-1234",
    "rtc": "GSRTC",
    "routeName": "Ahmedabad-Surat",
    "routeId": "route_object_id",
    "isActive": true
  }
  ```
- **Responses**:
  - `201 Created`: Bus created successfully.
  - `400 Bad Request`: Missing required fields.
  - `403 Forbidden`: Not allowed to create buses (not an admin).
  - `409 Conflict`: Bus registration number already exists.
  - `500 Internal Server Error`: Generic server error.

#### 4. Update Bus
- **Endpoint**: `PATCH /api/buses/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Updates fields of a specific bus. Requires `admin` role.
- **Body**: (All fields optional)
  ```json
  {
    "isActive": false,
    "routeName": "Ahmedabad-Rajkot"
  }
  ```
- **Responses**:
  - `200 OK`: Bus updated successfully.
  - `400 Bad Request`: Invalid update payload.
  - `403 Forbidden`: Not allowed to update buses (not an admin).
  - `404 Not Found`: Bus not found.
  - `409 Conflict`: Registration number already in use.
  - `500 Internal Server Error`: Generic server error.

#### 5. Delete Bus
- **Endpoint**: `DELETE /api/buses/:busId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Deletes a specific bus. Requires `admin` role.
- **Responses**:
  - `200 OK`: Bus deleted successfully.
  - `403 Forbidden`: Not allowed to delete buses (not an admin).
  - `404 Not Found`: Bus not found.
  - `500 Internal Server Error`: Generic server error.

#### 6. Get Bus Status
- **Endpoint**: `GET /api/buses/:busId/status`
- **Description**: Real-time status (active state and last known location) of a single bus.
- **Responses**:
  - `200 OK`: Bus status fetched successfully.
  - `404 Not Found`: Bus not found.
  - `500 Internal Server Error`: Generic server error.

#### 7. Get Bus History
- **Endpoint**: `GET /api/buses/:busId/history`
- **Description**: Fetches location history of a specific bus within a time range.
- **Query Parameters**:
  - `from` (number): Epoch timestamp (required).
  - `to` (number): Epoch timestamp (required).
  - `page` (number): Page number (default: 1).
  - `limit` (number): Results per page (default: 100, max: 500).
- **Responses**:
  - `200 OK`: Bus history fetched successfully.
  - `400 Bad Request`: Missing or invalid `from`/`to` parameters.
  - `404 Not Found`: Bus history not found.
  - `500 Internal Server Error`: Generic server error.

#### 8. Get Bus ETA
- **Endpoint**: `GET /api/buses/:busId/eta`
- **Description**: Estimates time of arrival for a bus to a given stop ID or coordinate.
- **Query Parameters**:
  - `stopId` (string, optional): Target stop ID.
  - `latitude` (number, optional): Target latitude.
  - `longitude` (number, optional): Target longitude.
- **Responses**:
  - `200 OK`: ETA fetched successfully.
  - `400 Bad Request`: Missing target coordinates/stopId or invalid values.
  - `404 Not Found`: Bus or stop not found.
  - `409 Conflict`: Bus lacks location data to calculate ETA.
  - `500 Internal Server Error`: Generic server error.

### Routes (`/api/routes`)

#### 1. Get Routes
- **Endpoint**: `GET /api/routes/`
- **Description**: Fetches paginated routes. Supports filtering.
- **Query Parameters**:
  - `rtc` (string/array): Filter by one or more RTCs.
  - `isActive` (boolean): Filter active or inactive routes.
  - `stopId` (string): Filter routes passing through this stop.
  - `page` (number): Page number.
  - `limit` (number): Results per page.
- **Responses**:
  - `200 OK`: Routes fetched successfully.
  - `400 Bad Request`: Invalid filter format.
  - `500 Internal Server Error`: Generic server error.

#### 2. Get Route by ID
- **Endpoint**: `GET /api/routes/:routeId`
- **Description**: Fetches a single route by ID.
- **Responses**:
  - `200 OK`: Route fetched successfully.
  - `404 Not Found`: Route not found.
  - `500 Internal Server Error`: Generic server error.

#### 3. Create Route
- **Endpoint**: `POST /api/routes/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Creates a new route. Requires `admin` role.
- **Body**:
  ```json
  {
    "name": "Mumbai-Pune Express",
    "rtc": "MSRTC",
    "stopIds": ["stop_object_id1", "stop_object_id2"],
    "totalDistanceKm": 150.5,
    "estimatedDurationMin": 180,
    "isActive": true
  }
  ```
- **Responses**:
  - `201 Created`: Route created successfully.
  - `400 Bad Request`: Missing fields or invalid format.
  - `403 Forbidden`: Not allowed to create routes (not an admin).
  - `500 Internal Server Error`: Generic server error.

#### 4. Update Route
- **Endpoint**: `PATCH /api/routes/:routeId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Updates fields of a specific route. Requires `admin` role.
- **Responses**:
  - `200 OK`: Route updated successfully.
  - `400 Bad Request`: Invalid update payload.
  - `403 Forbidden`: Not allowed to update routes.
  - `404 Not Found`: Route not found.
  - `500 Internal Server Error`: Generic server error.

#### 5. Delete Route
- **Endpoint**: `DELETE /api/routes/:routeId`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Deletes a specific route. Requires `admin` role.
- **Responses**:
  - `200 OK`: Route deleted successfully.
  - `403 Forbidden`: Not allowed to delete routes.
  - `404 Not Found`: Route not found.
  - `500 Internal Server Error`: Generic server error.

#### 6. Get Buses on Route
- **Endpoint**: `GET /api/routes/:routeId/buses`
- **Description**: Gets all active buses currently running on a route.
- **Query Parameters**:
  - `page` (number): Page number.
  - `limit` (number): Results per page.
- **Responses**:
  - `200 OK`: Buses fetched successfully.
  - `404 Not Found`: Route not found.
  - `500 Internal Server Error`: Generic server error.

### Locations (`/api/locations`)

#### 1. Submit Location Update
- **Endpoint**: `POST /api/locations/`
- **Headers Required**: `Authorization: Bearer <access_token>`
- **Description**: Driver submits real-time GPS update. Requires `driver` role with active shift.
- **Body**:
  ```json
  {
    "latitude": 19.0193,
    "longitude": 72.8439,
    "speed_kmh": 45,
    "heading_deg": 180
  }
  ```
- **Responses**:
  - `201 Created`: GPS location updated successfully.
  - `400 Bad Request`: Missing lat/lng or invalid data.
  - `403 Forbidden`: User is not a driver.
  - `404 Not Found`: Driver record or active bus not found.
  - `500 Internal Server Error`: Generic server error.

#### 2. Get Live Locations (All Buses)
- **Endpoint**: `GET /api/locations/live`
- **Description**: Returns latest positions of all active buses. Supports bounding queries.
- **Query Parameters**:
  - `rtc` (string/array): Filter by RTC.
  - `routeId` (string): Filter by Route ID.
  - `latitude`, `longitude`, `radius` (numbers): Geographic bounding.
  - `limit` (number): Max results to return.
- **Responses**:
  - `200 OK`: Live bus locations fetched successfully.
  - `400 Bad Request`: Invalid geospatial parameters.
  - `500 Internal Server Error`: Generic server error.

#### 3. Get Live Location (Single Bus)
- **Endpoint**: `GET /api/locations/live/:busId`
- **Description**: Returns the latest known position of a single bus.
- **Responses**:
  - `200 OK`: Live bus location fetched successfully.
  - `404 Not Found`: Bus location not found or bus inactive.
  - `500 Internal Server Error`: Generic server error.
