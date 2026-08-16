# server/Dockerfile
FROM node:22-slim
WORKDIR /app

# 只读根文件系统下 HOME 需可写（node 进程临时文件），运行时配合 --tmpfs /tmp
ENV HOME=/tmp

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

# 安全加固：非 root 运行（数据卷需对 node 用户可写，当前 fuwari_blog_data 为 777）
USER node

EXPOSE 3001
# 健康检查（node 自带 fetch，无需 curl）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsconfig 是 noEmit，直接用 tsx 跑 TS，无需编译步骤。
# 不用 pnpm start（corepack 缓存位于 /root，node 用户无权读取），直接 node + tsx loader。
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
