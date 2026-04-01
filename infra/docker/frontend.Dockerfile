# 阶段 1：依赖安装
FROM node:20-alpine AS deps
WORKDIR /app

# 换源：阿里云 npm 镜像
RUN npm config set registry https://registry.npmmirror.com

# 安装 pnpm 10.32.1
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || npm ci

# 阶段 2：构建
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

# 构建时注入的环境变量（Next.js standalone 会在 build 时固化）
# 宿主机 WORKSPACE_DIR，用于前端路径映射（host → /workspace/）
ARG NEXT_PUBLIC_WORKSPACE_DIR
ENV NEXT_PUBLIC_WORKSPACE_DIR=${NEXT_PUBLIC_WORKSPACE_DIR}

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
RUN npm run build

# 阶段 3：生产环境
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
