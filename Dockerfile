# syntax=docker/dockerfile:1.7
#
# Business Flights Travel website — production image for the self-hosted deployment (OVHcloud VPS + Docker Compose + Cloudflare
# Tunnel). See docs/DEPLOYMENT_VPS.md. The website has NO database: it talks to the Compass Tools CRM over HTTP
# (docs/CRM_API_INTEGRATION.md).
#
# Stages
#   deps     reproducible dependency install from package-lock.json
#   builder  `next build` with NEXT_OUTPUT=standalone
#   runner   the production server: only the traced standalone output, non-root. THIS is the default (last) target.
#
# Build:   docker compose build bft-web        (or: docker build -t business-flights-web .)
#
# SECRETS: none are needed, accepted or baked in. The site's public origin (https://www.businessflights.travel) is a constant in
# src/lib/constants.ts, so there is not even a build argument. Every secret (CRM_API_KEY, GMAIL_APP_PASSWORD, ...) reaches the
# container at RUN time from the protected .env file via compose.yaml. The build context must not contain .env or key files: see
# .dockerignore (and the final check in the runner stage, which fails the build if one slipped in).

# Pinned by version AND digest (the multi-arch index digest, read from Docker Hub on 2026-10-16 — the same image the Compass Tools
# CRM pins). A floating tag such as `node:24` could change under a rebuild; the digest cannot. Update policy: docs/DEPLOYMENT_VPS.md
# ("Updating the base image").
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# ca-certificates: TLS to Gmail SMTP and to images.unsplash.com (next/image optimisation).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- deps -------------------------------------------------------------------------------------------------------------------
FROM base AS deps
# Only what `npm ci` needs, so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----------------------------------------------------------------------------------------------------------------
FROM deps AS builder
COPY . .
ENV NEXT_OUTPUT=standalone \
    NODE_OPTIONS=--max-old-space-size=3072
# No CRM_API_* here, on purpose: the build never contacts the CRM (pages are static; the CRM is only called by the form server actions at run time).
RUN npm run build \
 && test -f .next/standalone/server.js

# ---- runner -----------------------------------------------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=768
# The traced standalone server (its own minimal node_modules), then the static assets it does not copy itself.
# Application files stay owned by root: the unprivileged `node` user can READ and execute them but cannot modify its own code. The
# only directory it may write is .next/cache (below).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# `sharp` powers next/image optimisation. Next's file tracer copies its .node file but not always the libvips libraries beside it,
# so take the COMPLETE platform packages from the dependency install (same approach as the CRM image).
COPY --from=deps /app/node_modules/@img ./node_modules/@img
# Dependency-free container health probe (GET /api/health on loopback).
COPY --from=builder /app/scripts/healthcheck.mjs ./scripts/healthcheck.mjs
# Next writes its image-optimisation and fetch caches under .next/cache at run time; it must be writable by the unprivileged user.
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next/cache
# This website stores NO files and NO customer data of its own: there is deliberately no data volume and no database. Submissions go to the CRM.
# Defence in depth: a local .env must never be present in the image (the build context excludes it; this fails the build if one slipped in).
RUN ! find /app -maxdepth 2 \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' | grep -q .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "server.js"]
