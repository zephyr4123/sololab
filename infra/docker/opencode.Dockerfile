FROM oven/bun:1.3-alpine

WORKDIR /app

# 安装 ripgrep、git 和编译工具
RUN apk add --no-cache ripgrep git python3 make g++ ca-certificates && update-ca-certificates

# 复制 OpenCode 引擎代码
COPY opencode/package.json opencode/bun.lock opencode/bunfig.toml ./
COPY opencode/patches/ patches/
COPY opencode/packages/ packages/

# 安装依赖（tree-sitter native 编译失败时忽略，不影响 server 模式）
RUN bun install --frozen-lockfile || bun install --frozen-lockfile --ignore-scripts

# OpenCode 项目级配置
COPY opencode/opencode.jsonc ./opencode.jsonc

ENV NODE_ENV=production

EXPOSE 3100

# 启动 OpenCode HTTP Server
CMD ["bun", "run", "--cwd", "packages/opencode", "--conditions=browser", "src/index.ts", "serve", "--port", "3100", "--hostname", "0.0.0.0"]
