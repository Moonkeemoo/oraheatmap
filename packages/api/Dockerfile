FROM oven/bun:1-alpine

WORKDIR /app

# Copy workspace manifests first for cached dep install
COPY package.json bun.lock* ./
COPY packages/api/package.json ./packages/api/

RUN bun install --production --frozen-lockfile

# Source
COPY packages/api ./packages/api

# data/ is mounted as a volume in docker-compose; copy as fallback for standalone runs
COPY data ./data

EXPOSE 3001

CMD ["bun", "run", "packages/api/src/index.ts"]
