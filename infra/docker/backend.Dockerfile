FROM python:3.12-slim

WORKDIR /app

# 换源：阿里云 Debian 镜像
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

# 换源：阿里云 PyPI 镜像
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制代码并安装依赖（非 editable 模式，生产环境无需 -e）
COPY backend/ backend/
COPY infra/docker/entrypoint.sh /entrypoint.sh
RUN pip install --no-cache-dir backend/ && chmod +x /entrypoint.sh

ENV PYTHONPATH=/app/backend/src

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
