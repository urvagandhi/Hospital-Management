# ── Backend Dockerfile ──
# Production-ready Node.js/Express API server

FROM node:20-alpine AS base
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY scripts/ ./scripts/

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S express -u 1001 -G nodejs
USER express

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
