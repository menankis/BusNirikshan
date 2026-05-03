# ── Stage 1: build the Vite/React app ─────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve static files with `serve` ──────────────────────────────────
FROM node:22-alpine AS runner

# Install the lightweight static-file server globally
RUN npm install -g serve

# Add a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only the built assets from the builder stage
COPY --from=builder /app/dist /app/dist

USER appuser
WORKDIR /app

EXPOSE 3000

# -s  = SPA mode (all unknown paths fall back to index.html)
# -l  = port to listen on
CMD ["serve", "-s", "dist", "-l", "3000"]
