# ── Stage 1: install production dependencies ─────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first so Docker cache is reused when only source changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Run as a non-root user for security
RUN addgroup -S pandemic && adduser -S pandemic -G pandemic

WORKDIR /app

# Copy installed modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY server/ ./server/
COPY client/ ./client/
COPY package.json ./

USER pandemic

EXPOSE 3000

# PORT env var is respected by server/index.js (defaults to 3000)
ENV NODE_ENV=production \
    PORT=3000

CMD ["node", "server/index.js"]
