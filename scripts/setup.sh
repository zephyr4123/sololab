#!/bin/bash
set -e

echo "=== SoloLab Setup ==="

# 检查前置条件
command -v docker >/dev/null 2>&1 || { echo "需要 Docker，但未安装。"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "需要 Docker Compose，但未安装。"; exit 1; }

# 复制环境变量文件
if [ ! -f .env ]; then
    cp .env.example .env
    echo "已从 .env.example 创建 .env"
    echo ""
    echo "请编辑 .env 文件，填入以下必要配置："
    echo "  - LLM_API_KEY          : LLM API 密钥"
    echo "  - EMBEDDING_API_KEY    : Embedding API 密钥"
    echo "  - TAVILY_API_KEY       : Tavily 搜索 API 密钥"
    echo "  - POSTGRES_PASSWORD    : PostgreSQL 密码（默认: sololab）"
    echo "  - REDIS_PASSWORD       : Redis 密码（默认: sololab）"
    echo ""
    echo "配置完成后重新运行此脚本。"
    exit 0
fi

# 创建存储目录
mkdir -p storage

# 启动所有服务（包含 PostgreSQL、Redis、Backend、Frontend、Caddy）
echo "正在启动 SoloLab 服务..."
docker compose up -d

# 等待数据库就绪
echo "等待数据库就绪..."
docker compose exec backend python -c "import asyncio; print('Backend ready')" 2>/dev/null || true

echo ""
echo "=== SoloLab 启动成功 ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "运行 'docker compose logs -f' 查看日志"
echo "运行 'docker compose down' 停止服务"
