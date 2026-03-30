FROM oven/bun:1.3-alpine

WORKDIR /app

# 安装 ripgrep、git 和 tree-sitter 编译依赖（python3 + build tools）
RUN apk add --no-cache ripgrep git python3 make g++

# 复制 OpenCode 引擎代码
COPY opencode/package.json opencode/bun.lock opencode/bunfig.toml ./
COPY opencode/patches/ patches/
COPY opencode/packages/ packages/

# 安装依赖
RUN bun install --frozen-lockfile

# OpenCode 项目级配置
COPY opencode/opencode.jsonc ./opencode.jsonc

ENV NODE_ENV=production

EXPOSE 3100

# 启动 OpenCode HTTP Server
CMD ["bun", "run", "--cwd", "packages/opencode", "--conditions=browser", "src/index.ts", "serve", "--port", "3100", "--hostname", "0.0.0.0"]
