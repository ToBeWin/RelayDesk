FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV RELAYDESK_DATA_DIR=/app/data
ENV HOSTNAME=0.0.0.0
RUN groupadd --system relaydesk && useradd --system --gid relaydesk relaydesk
COPY --from=builder --chown=relaydesk:relaydesk /app/.next/standalone ./
COPY --from=builder --chown=relaydesk:relaydesk /app/.next/static ./.next/static
COPY --from=builder --chown=relaydesk:relaydesk /app/public ./public
RUN mkdir -p /app/data && chown -R relaydesk:relaydesk /app/data
USER relaydesk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
