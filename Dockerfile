# Node 22.23.4: fixes the 2026-10-21 Node security release. Node 22, not 24:
# uWebSockets.js at the pinned commit ships binaries up to ABI 127.
# Build stage
FROM node:22.23.4-bookworm-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/client ./apps/client

# Build shared package first
RUN pnpm --filter @swipe/shared build

# Build client and server in parallel
RUN pnpm --parallel --filter @swipe/client --filter @swipe/server build

# Production stage
FROM node:22.23.4-bookworm-slim AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built shared package
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy built server
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/data ./apps/server/data

# Copy built client to be served by server
COPY --from=builder /app/apps/client/dist ./apps/client/dist

ENV NODE_ENV=production
ENV PORT=2567

EXPOSE 2567

CMD ["node", "apps/server/dist/index.js"]
