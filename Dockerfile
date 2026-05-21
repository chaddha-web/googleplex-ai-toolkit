# ─────────────────────────────────────────────────────────────────────────
# Monorepo single-image build.
#
# Strategy for v1: build the entire workspace once into one large image,
# then run different services from it via `command:` overrides in
# docker-compose.prod.yml. Bigger image (~700 MB) than per-service images
# would be, but: one build pass, one cache, one push. We can split later.
#
# Native deps that need building: better-sqlite3, @node-rs/argon2,
# tiny-secp256k1. Debian-slim ships GCC + Python via build-essential.
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential python3 python3-distutils ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only manifests first for a cached install layer.
COPY package.json package-lock.json* ./
COPY apps/landing/package.json   apps/landing/package.json
COPY apps/web/package.json       apps/web/package.json
COPY apps/admin/package.json     apps/admin/package.json
COPY services/auth/package.json  services/auth/package.json
COPY services/wallet/package.json services/wallet/package.json
COPY services/governance/package.json services/governance/package.json
COPY services/handlers/package.json services/handlers/package.json
COPY packages/ui/package.json    packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/dao-actions/package.json packages/dao-actions/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/wallet/package.json packages/wallet/package.json
COPY packages/governance-shared/package.json packages/governance-shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ai/package.json packages/ai/package.json
# packages/{analytics,db,email} are orphan dirs with src/ but no package.json
# — npm install will skip them, full source still copied in build stage.

RUN npm install --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────
# Build stage — bring in full source, build the three Next apps
# ─────────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY . .

# NEXT_PUBLIC_* must be present at *build* time — Next.js inlines them into
# the client bundle. Passed in via compose build.args; default to the prod
# domain so a bare `docker build` still produces working URLs.
ARG NEXT_PUBLIC_AUTH_BASE=https://auth.ggakingclub.com
ARG NEXT_PUBLIC_WALLET_BASE=https://wallet.ggakingclub.com
ARG NEXT_PUBLIC_WEB_URL=https://app.ggakingclub.com
ARG NEXT_PUBLIC_SITE_URL=https://ggakingclub.com
ENV NEXT_PUBLIC_AUTH_BASE=$NEXT_PUBLIC_AUTH_BASE \
    NEXT_PUBLIC_WALLET_BASE=$NEXT_PUBLIC_WALLET_BASE \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Build the three Next apps. Services run via tsx at runtime so no build
# step needed for them.
RUN npm run build --workspace @googolplex/landing && \
    npm run build --workspace @googolplex/web && \
    npm run build --workspace @googolplex/admin

# ─────────────────────────────────────────────────────────────────────────
# Runtime stage — slim down by dropping build toolchain
# ─────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything we built (node_modules + sources + .next dirs).
COPY --from=build /app /app

# Default writable data dir for SQLite volumes.
RUN mkdir -p /app/services/auth/data /app/services/wallet/data

ENV NODE_ENV=production

# `tini` reaps zombies — important when each container runs a single Node process.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default to landing; docker-compose overrides this per service.
CMD ["npm", "run", "start", "--workspace", "@googolplex/landing"]
