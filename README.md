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
