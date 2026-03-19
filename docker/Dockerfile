# ── ci: lint + unit + integration ─────────────────────────────────────────────
# Mirrors the GitHub Actions "test" job (ubuntu-latest + Node 22).
# Uses the slim variant — no GUI libraries needed.
FROM node:22-bookworm-slim AS ci

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ── e2e: Playwright + Electron + Xvfb ─────────────────────────────────────────
# Adds the Electron system dependencies and a virtual framebuffer so the
# Electron window can render headlessly, matching what ubuntu-latest provides
# in CI when the Linux build + Playwright jobs run.
FROM node:22-bookworm AS e2e

WORKDIR /app

RUN apt-get update -y && apt-get install -y \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    xvfb \
    dbus \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Pre-build the Electron app so the e2e tests can launch immediately.
RUN npm run build:e2e
