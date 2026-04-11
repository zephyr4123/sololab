#!/bin/bash
set -e

echo "=== Running database migrations ==="
cd /app/backend && alembic upgrade head

echo "=== Checking WriterAI sandbox image (background) ==="
(
    if docker image inspect sololab-writer-sandbox > /dev/null 2>&1; then
        echo "[sandbox] Image already exists, skipping build."
    else
        echo "[sandbox] Building image in background..."
        if docker build -t sololab-writer-sandbox -f /app/infra/docker/writer-sandbox.Dockerfile /app 2>&1 \
            | while read -r line; do echo "[sandbox] $line"; done \
            && docker image inspect sololab-writer-sandbox > /dev/null 2>&1; then
            echo "[sandbox] Build successful."
        else
            echo "[sandbox] ERROR: Build failed. Code execution will be unavailable."
        fi
    fi
) &

echo "=== Starting backend server ==="
exec uvicorn sololab.main:app --host 0.0.0.0 --port 8000 "$@"
