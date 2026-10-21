# Node 22.23.4 fixes the 2026-10-21 security release (Brotli RCE, TLS hostname bypasses).
# Node 22, not 24: uWebSockets.js at this commit ships binaries up to ABI 127 (Node 22).
# Docker Hub's node:22.23.4 images weren't built yet, so install the official
# nodejs.org binary, checksum-verified. Once node:22.23.4-bookworm-slim exists,
# replace this stage with that image. (NODE_PATCHED, not NODE_VERSION: the base
# image's ENV NODE_VERSION would silently override an ARG of that name.)
FROM node:22-bookworm-slim AS node-patched
ARG NODE_PATCHED=22.23.4
RUN set -eux; \
    apt-get update; apt-get install -y --no-install-recommends curl ca-certificates; \
    f="node-v${NODE_PATCHED}-linux-x64.tar.gz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_PATCHED}/${f}"; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_PATCHED}/SHASUMS256.txt" | grep " ${f}\$" | sha256sum -c -; \
    tar -xzf "$f" -C /usr/local --strip-components=1 --no-same-owner --exclude='*/CHANGELOG.md' --exclude='*/README.md' --exclude='*/LICENSE'; \
    rm "$f"; apt-get purge -y curl; apt-get autoremove -y; rm -rf /var/lib/apt/lists/*; \
    test "$(node -v)" = "v${NODE_PATCHED}"

# Build stage
FROM node-patched AS builder

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
FROM node-patched AS production

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
