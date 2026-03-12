FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY backend/pyproject.toml backend/
RUN pip install --no-cache-dir -e backend/

# Copy application code
COPY backend/ backend/

ENV PYTHONPATH=/app/backend/src

EXPOSE 8000

CMD ["uvicorn", "sololab.main:app", "--host", "0.0.0.0", "--port", "8000"]
