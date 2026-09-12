# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build stage
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile first so dependency layers cache across code changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json ./server/
COPY widget/package.json ./widget/
RUN npm ci

COPY server ./server
COPY widget ./widget
RUN npm run build --workspace server \
 && npm run build --workspace widget

# Drop dev dependencies from the tree we are about to copy forward.
RUN npm prune --omit=dev

# ----------------------------------------------------------------- run stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Never run the payment service as root.
RUN addgroup -S basepay && adduser -S basepay -G basepay

COPY --from=build --chown=basepay:basepay /app/node_modules ./node_modules
COPY --from=build --chown=basepay:basepay /app/package.json ./package.json
COPY --from=build --chown=basepay:basepay /app/server/package.json ./server/package.json
COPY --from=build --chown=basepay:basepay /app/server/dist ./server/dist
COPY --from=build --chown=basepay:basepay /app/server/migrations ./server/migrations
COPY --from=build --chown=basepay:basepay /app/widget/dist ./widget/dist
COPY --from=build --chown=basepay:basepay /app/widget/demo ./widget/demo

USER basepay
EXPOSE 8080

# The service migrates on boot, so a fresh database needs no extra step.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
