FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- deps ----------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tmdb/package.json ./packages/tmdb/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/core/package.json ./packages/core/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-mv/api...

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @ai-mv/db run generate
RUN pnpm --filter @ai-mv/api run build

# ---- runtime -------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages ./packages

EXPOSE 4000
CMD ["node", "dist/server.js"]
