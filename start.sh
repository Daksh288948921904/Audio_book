#!/bin/bash
set -e

echo "==> Starting Qdrant..."
docker-compose up -d

echo "==> Starting Backend..."
cd "$(dirname "$0")"
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "==> Starting Frontend..."
cd frontend && npm install --silent && npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker-compose stop" EXIT
wait
