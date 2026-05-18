# Sample Test Cases

These test cases are written for project presentation and manual validation. They cover frontend, backend, real-time tracking, analytics, authentication, and deployment setup.

| No. | Test Case | Steps | Expected Result |
|---:|---|---|---|
| 1 | User registration starts OTP flow | Open `/register`, enter valid name, email, password, role, and RTC, then submit. | User is redirected to `/verify-otp`; backend creates a pending OTP token. |
| 2 | OTP appears in development logs | Register with `DEV_SKIP_EMAIL="true"` enabled. | Backend terminal prints the OTP inside the skipped email output. |
| 3 | Valid OTP creates account | Enter the latest 6-digit OTP on `/verify-otp`. | Account is created and user is redirected to `/login`. |
| 4 | Invalid OTP is rejected | Enter a wrong OTP on `/verify-otp`. | Page shows an error and account is not created. |
| 5 | Login with valid credentials | Open `/login`, enter registered email and password. | User receives access token and is redirected to dashboard. |
| 6 | Login with invalid credentials | Enter wrong password on `/login`. | Login fails with an error message; user remains on login page. |
| 7 | Protected route blocks unauthenticated user | Clear localStorage token and open `/passenger`, `/driver`, or `/admin`. | User is redirected to `/login`. |
| 8 | Role-based dashboard redirect | Login as passenger, driver, and admin separately, then open `/dashboard`. | Passenger goes to `/passenger`, driver to `/driver`, admin can access `/admin`. |
| 9 | Passenger live map loads | Login as passenger and open `/passenger`. | Map renders, sidebar loads buses/stops, and live status is visible. |
| 10 | Profile menu stays above map | On passenger or driver dashboard, click profile icon. | Dropdown appears above the Leaflet map and is fully clickable. |
| 11 | Bus search filters list | On passenger dashboard, type a bus number or route name in search. | Bus list filters to matching records. |
| 12 | Nearby stops load with location | Allow browser geolocation on passenger dashboard. | Nearby stops section shows stops close to current location. |
| 13 | ETA loads for selected stop | Select a nearby stop. | ETA section displays approaching buses and estimated minutes when data exists. |
| 14 | Driver can start shift | Login as driver, select assigned bus/route, start shift. | Driver status changes to active and location broadcasting begins. |
| 15 | Driver location update reaches backend | While driver shift is active, send/manual update location. | Backend stores location in `BusLocation` time-series collection and updates bus last known location. |
| 16 | WebSocket live update appears for passenger | Keep passenger dashboard open while driver sends location. | Passenger map receives live bus marker update without page refresh. |
| 17 | Bus history path replay loads | Select a bus on passenger dashboard, open History tab, choose time range, click load path replay. | Historical route line appears on map with replay marker and timestamp slider. |
| 18 | Analytics dashboard loads active bus stats | Login as admin and open Admin > Analytics. | Active/inactive bus counts and selected bus metrics are displayed from `/api/analytics`. |
| 19 | Swagger documentation opens | Start backend and open `/api-docs`. | Swagger UI loads generated API documentation. |
| 20 | Docker setup starts full stack | Build/run MongoDB, Redis, backend, and frontend containers using setup instructions. | Frontend opens on port `3000`, backend responds on port `5000`, and app can register/login. |

## Presentation Notes

- Use test cases 1-8 to demonstrate authentication and security.
- Use test cases 9-17 to demonstrate real-time tracking and MongoDB time-series history.
- Use test cases 18-20 to demonstrate admin analytics, API documentation, and deployment readiness.
