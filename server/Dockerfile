# server/Dockerfile
FROM node:22-slim
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3001
# tsconfig 是 noEmit，直接用 tsx 跑 TS，无需编译步骤
CMD ["pnpm", "start"]