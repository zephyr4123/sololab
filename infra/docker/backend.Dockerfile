FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制并安装 Python 依赖
COPY backend/pyproject.toml backend/
RUN pip install --no-cache-dir -e backend/

# 复制应用代码
COPY backend/ backend/

ENV PYTHONPATH=/app/backend/src

EXPOSE 8000

CMD ["uvicorn", "sololab.main:app", "--host", "0.0.0.0", "--port", "8000"]
