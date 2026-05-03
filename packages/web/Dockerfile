FROM oven/bun:1-alpine

WORKDIR /app

# Install workspace deps. Copying root + web manifests first lets Docker
# cache the heavy `bun install` step across builds that only change source.
COPY package.json bun.lock* tsconfig.base.json ./
COPY packages/web/package.json ./packages/web/
RUN bun install 

# Source
COPY packages/web ./packages/web

# Build-time API URL — embedded into client bundle by Next.js for NEXT_PUBLIC_*.
# Default points at the deployed Caddy origin so a rebuild on the server
# Just Works; override at build time with --build-arg NEXT_PUBLIC_API_URL=...
ARG NEXT_PUBLIC_API_URL=https://oralab.xyz
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/packages/web
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "start"]
