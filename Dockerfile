# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --silent
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + bundled frontend ────────────────────────────────
FROM python:3.11-slim

# psycopg2 needs libpq; sentence-transformers needs git for some model fetches
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download fastembed ONNX model into the image so runtime startup is instant.
# Without this, every cold start downloads ~25 MB, causing workers to time out
# before the health check passes.
RUN python3 -c "from fastembed import TextEmbedding; list(TextEmbedding('BAAI/bge-small-en-v1.5').embed(['warmup']))"

# Copy source
COPY backend/ ./backend/

# Copy frontend build from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist/

# Render injects $PORT at runtime; default to 8000 for local docker run
ENV PORT=8000
EXPOSE 8000

CMD gunicorn backend.main:app \
    -w 1 \
    -k uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT}" \
    --timeout 120 \
    --log-level info
