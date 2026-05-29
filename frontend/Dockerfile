# ── Frontend Dockerfile ──
# Multi-stage build: Node build → Nginx serve

# Stage 1: Build the React/Vite app
FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# VITE_* env vars must be present at build time
# They are passed via docker-compose build args
ARG VITE_API_URL=/api
ARG VITE_APP_NAME="MyMediVault"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_NAME=$VITE_APP_NAME

RUN npm run build

# Stage 2: Serve with Nginx
FROM public.ecr.aws/docker/library/nginx:1.25-alpine AS production

# Copy built static files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-check-certificate --no-verbose --tries=1 --spider https://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
