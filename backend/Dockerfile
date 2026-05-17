# ── Stage 1: install production dependencies ──────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# ── Stage 2: final runtime image ──────────────────────────────────────────────
FROM node:22-alpine AS runner

# Add a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Drop privileges
USER appuser

EXPOSE 5000
CMD ["npm", "start"]
