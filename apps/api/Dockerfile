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

RUN addgroup --system --gid 1001 AWIK NET && \
    adduser --system --uid 1001 AWIK NET

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/packages/database/prisma ./packages/database/prisma

ENV NODE_ENV=production
ENV PORT=3001

RUN chown -R AWIK NET:AWIK NET /app

USER AWIK NET

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["dumb-init", "node", "apps/api/dist/main.js"]
