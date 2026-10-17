FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/

RUN npm ci

FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/database ./packages/database

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN cd apps/api && npm run build

FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init

RUN addgroup --system --gid 1001 awiknet && \
    adduser --system --uid 1001 awiknet

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001

# `sed` strips carriage returns so the script stays valid if the repo is checked
# out on Windows (Git may rewrite the line endings to CRLF).
RUN sed -i 's/\r$//' ./apps/api/docker-entrypoint.sh && \
    chmod +x ./apps/api/docker-entrypoint.sh && \
    chown -R awiknet:awiknet /app

USER awiknet

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--", "./apps/api/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
