# Multi-stage build for the react-os-shell demo.
#
# Stage 1 (builder)  — install package deps, build the package, install demo
#                      deps (which file:-link to the just-built package), then
#                      build the demo's static bundle.
# Stage 2 (runtime)  — minimal node image that serves the built demo via
#                      `vite preview` on port 4173.
#
# Build:  docker build -t react-os-shell-demo .
# Run:    docker run --rm -p 4173:4173 react-os-shell-demo
# Or:     docker compose up --build      (see docker-compose.yml)

# ── Stage 1 ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Package install — copy only what `npm ci` needs first so Docker can cache
# the dependency layer.
COPY package.json package-lock.json ./
RUN npm ci

# Copy package source + build it (tsup → ./dist).
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# Demo install — file:../.. picks up /app/dist + /app/package.json from above.
COPY examples/demo/package.json examples/demo/package-lock.json ./examples/demo/
RUN cd examples/demo && npm install

# Demo source + build static bundle.
COPY examples/demo ./examples/demo
RUN cd examples/demo && npm run build

# ── Stage 2 ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app/examples/demo

# Bring over the built demo + its node_modules (vite preview needs vite).
COPY --from=builder /app/examples/demo/dist ./dist
COPY --from=builder /app/examples/demo/package.json ./package.json
COPY --from=builder /app/examples/demo/node_modules ./node_modules

EXPOSE 4173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173"]
