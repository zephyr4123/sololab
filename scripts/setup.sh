#!/bin/bash
set -e

echo "=== SoloLab Setup ==="

# 检查前置条件
command -v docker >/dev/null 2>&1 || { echo "需要 Docker，但未安装。"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "需要 Docker Compose，但未安装。"; exit 1; }

# 复制环境变量文件
if [ ! -f .env ]; then
    cp .env.example .env
    echo "已从 .env.example 创建 .env。请填入你的 API 密钥。"
    echo "然后运行：docker compose up -d"
    exit 0
fi

# 启动服务
echo "正在启动 SoloLab 服务..."
docker compose up -d

echo ""
echo "=== SoloLab is starting ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "运行 'docker compose logs -f' 查看日志。"
