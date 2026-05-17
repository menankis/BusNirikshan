# Developer Setup

This guide gets BusNirikshan running locally for development and also covers Docker-based setup. The project has two apps:

- `backend`: Express, MongoDB, Redis, WebSocket, Swagger UI
- `frontend`: React + Vite

## Requirements

Install these first:

- Node.js 22.x
- npm
- MongoDB 6 or newer
- Redis 7 or newer
- Docker Desktop, optional but recommended for container setup
- Git

Default ports:

- Backend API: `http://localhost:5000`
- Swagger docs: `http://localhost:5000/api-docs`
- Frontend dev server: `http://localhost:5173`
- Frontend Docker/static server: `http://localhost:3000`
- MongoDB: `mongodb://127.0.0.1:27017`
- Redis: `redis://127.0.0.1:6379`

## Clone And Install

From the repo root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

If you see `Cannot find module ...`, run `npm install` again in that app folder.

## Environment Variables

Create `backend/.env`. You can copy from the root example:

```bash
cp ../env.example .env
```

For local development, use values like:

```env
MONGODB_URI="mongodb://127.0.0.1:27017/busnirikshan"
REDIS_URL="redis://127.0.0.1:6379"

PORT="5000"
SALT_ROUNDS="12"
ACCESS_TOKEN_SECRET="replace-with-a-long-random-secret"
REFRESH_TOKEN_SECRET="replace-with-a-different-long-random-secret"
RESET_TOKEN_SECRET="replace-with-another-long-random-secret"
FRONTEND_URL="http://localhost:5173"

DEV_SKIP_EMAIL="true"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_AUTH="true"
SMTP_USER="username"
SMTP_PASS="password"
```

`DEV_SKIP_EMAIL="true"` is useful during development. OTP emails are not sent; the backend prints the OTP in the terminal/log instead.

The frontend works without a `.env` because it defaults to `http://localhost:5000`. If needed, create `frontend/.env`:

```env
VITE_API_URL="http://localhost:5000"
VITE_WS_URL="ws://localhost:5000"
```

## Start Local Services

Start MongoDB and Redis before the backend.

If installed locally:

```bash
mongod
redis-server
```

Or with Docker:

```bash
docker run --name busnirikshan-mongo -p 27017:27017 -d mongo:7
docker run --name busnirikshan-redis -p 6379:6379 -d redis:7-alpine
```

If containers already exist:

```bash
docker start busnirikshan-mongo busnirikshan-redis
```

## Run In Development

Terminal 1, backend:

```bash
cd backend
node server.js
```

Terminal 2, frontend:

```bash
cd frontend
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:5000`
- Swagger docs: `http://localhost:5000/api-docs`

## Login And OTP Flow

1. Open `http://localhost:5173/register`.
2. Create an account.
3. If `DEV_SKIP_EMAIL="true"`, check the backend terminal for:

```text
[DEV] Skipping email send. Would have sent:
...
<h2 style="letter-spacing:4px">123456</h2>
```

4. Enter that OTP on `/verify-otp`.
5. Log in at `/login`.

## Build Checks

Frontend production build:

```bash
cd frontend
npm run build
```

Backend syntax check:

```bash
cd backend
node --check server.js
```

Generate Swagger output after route changes:

```bash
cd backend
npm run swagger
```

## Docker Build

Build backend image:

```bash
docker build -t busnirikshan-backend ./backend
```

Build frontend image:

```bash
docker build -t busnirikshan-frontend ./frontend --build-arg VITE_API_URL=http://localhost:5000
```

Run backend container against local Docker MongoDB and Redis:

```bash
docker run --name busnirikshan-backend \
  -p 5000:5000 \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/busnirikshan" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e PORT="5000" \
  -e DEV_SKIP_EMAIL="true" \
  -e ACCESS_TOKEN_SECRET="replace-with-a-long-random-secret" \
  -e REFRESH_TOKEN_SECRET="replace-with-a-different-long-random-secret" \
  -e RESET_TOKEN_SECRET="replace-with-another-long-random-secret" \
  busnirikshan-backend
```

Run frontend container:

```bash
docker run --name busnirikshan-frontend -p 3000:3000 busnirikshan-frontend
```

Open `http://localhost:3000`.

## Optional Docker Compose

This repo does not currently include a `docker-compose.yml`. Developers can create one at the repo root:

```yaml
services:
  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      MONGODB_URI: mongodb://mongo:27017/busnirikshan
      REDIS_URL: redis://redis:6379
      PORT: "5000"
      DEV_SKIP_EMAIL: "true"
      FRONTEND_URL: http://localhost:3000
      ACCESS_TOKEN_SECRET: replace-with-a-long-random-secret
      REFRESH_TOKEN_SECRET: replace-with-a-different-long-random-secret
      RESET_TOKEN_SECRET: replace-with-another-long-random-secret
      SMTP_HOST: smtp.gmail.com
      SMTP_PORT: "465"
      SMTP_AUTH: "true"
      SMTP_USER: username
      SMTP_PASS: password
    depends_on:
      - mongo
      - redis

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_URL: http://localhost:5000
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  mongo-data:
```

Then run:

```bash
docker compose up --build
```

## Common Issues

### `Cannot find module 'swagger-ui-express'`

Run:

```bash
cd backend
npm install
```

### `EADDRINUSE: address already in use :::5000`

The backend is already running on port `5000`. Stop the old process or change `PORT` in `backend/.env`.

On Windows PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 5000 | Select-Object OwningProcess
Stop-Process -Id <PID>
```

### Frontend cannot call the API

Check:

- Backend is running on `http://localhost:5000`
- `frontend/.env` has `VITE_API_URL="http://localhost:5000"` if you customized it
- Backend `FRONTEND_URL` allows your frontend origin

### OTP is not emailed

If `DEV_SKIP_EMAIL="true"`, this is expected. Read the OTP from the backend terminal. To send real email, set `DEV_SKIP_EMAIL="false"` and configure valid SMTP credentials.

### Redis connection errors

Start Redis or update `REDIS_URL`. For local development:

```env
REDIS_URL="redis://127.0.0.1:6379"
```

### MongoDB connection errors

Start MongoDB or update `MONGODB_URI`. For local development:

```env
MONGODB_URI="mongodb://127.0.0.1:27017/busnirikshan"
```

## Useful URLs

- Frontend dev: `http://localhost:5173`
- Frontend Docker: `http://localhost:3000`
- Backend API: `http://localhost:5000`
- Swagger docs: `http://localhost:5000/api-docs`
