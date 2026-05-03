# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Hospital Management — Frontend (React + Vite, served by nginx)
# Two stages: Node build → nginx:alpine runtime serving the built dist/.
# This image is the public edge: it serves the SPA AND reverse-proxies /api/.
#
# Build:  docker build -t hms-web:local frontend/
# Run:    docker run --rm -p 80:80 hms-web:local
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20.18.1-alpine3.20
ARG NGINX_VERSION=1.27-alpine

# ── Stage 1: build the SPA ───────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS build
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

# Install deps first (cacheable layer). NOTE: we do NOT use --omit=dev here
# because Vite, TypeScript, Tailwind, PostCSS etc. live in devDependencies
# and are required to produce the build output.
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Vite-time env vars (baked into the final bundle — set at build, not runtime)
ARG VITE_API_URL=/api
ARG VITE_APP_NAME="Hospital Management System"
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_NAME=$VITE_APP_NAME

# Copy the rest of the source. .dockerignore keeps node_modules/dist/etc out.
COPY . .

RUN npm run build \
 && ls -la dist/ \
 && du -sh dist/

# ── Stage 2: nginx runtime ───────────────────────────────────────────────────
FROM nginx:${NGINX_VERSION} AS runtime

# Built SPA → nginx web root
COPY --from=build /app/dist /usr/share/nginx/html

# Site config (SPA fallback + /api/ reverse proxy + caching + security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Drop the default conf shipped with the image so nothing else listens on :80
RUN rm -f /etc/nginx/conf.d/default.conf.bak

EXPOSE 80

# Liveness probe — tiny dedicated /healthz returns "ok" with no DB hit
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1

LABEL org.opencontainers.image.title="hms-web" \
      org.opencontainers.image.description="Hospital Management — React SPA + nginx edge proxy" \
      org.opencontainers.image.source="https://github.com/<owner>/Hospital-Management" \
      org.opencontainers.image.licenses="Proprietary"

# nginx handles SIGTERM/SIGQUIT cleanly; no need for tini/dumb-init
CMD ["nginx", "-g", "daemon off;"]
