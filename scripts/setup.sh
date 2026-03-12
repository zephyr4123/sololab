#!/bin/bash
set -e

echo "=== SoloLab Setup ==="

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "Docker Compose is required but not installed."; exit 1; }

# Copy env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example. Please fill in your API keys."
    echo "Then run: docker compose up -d"
    exit 0
fi

# Start services
echo "Starting SoloLab services..."
docker compose up -d

echo ""
echo "=== SoloLab is starting ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Run 'docker compose logs -f' to view logs."
