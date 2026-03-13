FROM python:3.11-slim

WORKDIR /app

# 安装 MinerU 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 安装 MinerU
RUN pip install --no-cache-dir magic-pdf[full]

EXPOSE 8001

CMD ["python", "-m", "http.server", "8001"]
