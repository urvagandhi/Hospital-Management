# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Hospital Management — Backend (Node.js + Express)
# Production image. Pinned Node, multi-stage, non-root user, dumb-init for
# clean PID 1 signal handling.
#
# Build:  docker build -t hms-backend:local backend/
# Run:    docker run --rm -p 5000:5000 --env-file backend/.env hms-backend:local
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20.18.1-alpine3.20

# ── Stage 1: install production dependencies ─────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

# Lockfile is required for reproducible installs (npm ci enforces this)
COPY package.json package-lock.json* ./

# --ignore-scripts blocks post-install scripts from arbitrary transitive deps
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_LOGLEVEL=warn

# dumb-init = proper PID 1 (forwards SIGTERM, reaps zombies on shutdown)
RUN apk add --no-cache dumb-init

# Non-root user (uid 1001 to match dev compose)
RUN addgroup -g 1001 -S nodejs \
 && adduser  -S express -u 1001 -G nodejs

# Bring in deps + source with the right ownership
COPY --chown=express:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=express:nodejs package.json ./
COPY --chown=express:nodejs src/      ./src/
COPY --chown=express:nodejs scripts/  ./scripts/

USER express

EXPOSE 5000

# Liveness probe — bind to 127.0.0.1 explicitly, no DNS resolution required
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# OCI metadata (helps `docker image inspect` and registries)
LABEL org.opencontainers.image.title="hms-backend" \
      org.opencontainers.image.description="Hospital Management System — Express API" \
      org.opencontainers.image.source="https://github.com/<owner>/Hospital-Management" \
      org.opencontainers.image.licenses="Proprietary"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
