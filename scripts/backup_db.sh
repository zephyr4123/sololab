#!/bin/bash
# PostgreSQL 备份脚本
# 使用 ~/docker-services/ 的 PostgreSQL 容器（container: local-postgres）
# 用法: ./scripts/backup_db.sh [backup_dir]

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/sololab_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="local-postgres"

mkdir -p "$BACKUP_DIR"

echo "Starting PostgreSQL backup from container: ${CONTAINER_NAME}..."
docker exec -t "$CONTAINER_NAME" pg_dump -U sololab sololab | gzip > "$BACKUP_FILE"

echo "Backup saved to: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# 保留最近 7 个备份
cd "$BACKUP_DIR"
ls -t sololab_*.sql.gz | tail -n +8 | xargs -r rm -f
echo "Cleanup done. Retained backups:"
ls -lh sololab_*.sql.gz 2>/dev/null || echo "  (no backups found)"
