#!/bin/bash
set -e

echo "=== Running database migrations ==="
cd /app/backend && alembic upgrade head

echo "=== Checking WriterAI sandbox image ==="
if docker image inspect sololab-writer-sandbox > /dev/null 2>&1; then
    echo "Sandbox image exists, skipping build."
else
    echo "Building WriterAI sandbox image..."
    docker build -t sololab-writer-sandbox -f /app/infra/docker/writer-sandbox.Dockerfile /app 2>&1 || {
        echo "WARNING: Sandbox image build failed. Code execution will be unavailable."
    }
fi

echo "=== Starting backend server ==="
exec uvicorn sololab.main:app --host 0.0.0.0 --port 8000 "$@"
