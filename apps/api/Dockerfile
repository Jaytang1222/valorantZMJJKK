FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @valo-yiba/contracts build && pnpm --filter @valo-yiba/api build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=dependencies /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY data ./data
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
