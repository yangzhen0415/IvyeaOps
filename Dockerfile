# ═══════════════════════════════════════════════════════════════════
# ops-hub Dockerfile
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Frontend build ────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY client/package.json client/package-lock.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx curl procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server/ ./server/
COPY --from=frontend-build /build/dist /app/client/dist
COPY deploy/docker/nginx.conf /etc/nginx/nginx.conf

ENV OPSHUB_DATA_DIR=/app/data
ENV OPSHUB_HOST=0.0.0.0
ENV OPSHUB_PORT=8001
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/server

RUN mkdir -p /app/data

EXPOSE 80

COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
