#!/bin/bash
set -e

echo "=== Running database migrations ==="
cd /app/backend && alembic upgrade head

echo "=== Starting backend server ==="
exec uvicorn sololab.main:app --host 0.0.0.0 --port 8000 "$@"
