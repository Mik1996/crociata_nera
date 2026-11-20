# Next.js backend (backend/): API, authentication and war sync scheduler.

# --- build -------------------------------------------------------------------
FROM node:24.22.3-alpine3.24 AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:24.22.3-alpine3.24
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Files of the site the announcement pictures are drawn with (src/lib/assets/site-assets.ts).
COPY --chown=node:node public/assets/fonts/pdf ./site-assets/assets/fonts/pdf
COPY --chown=node:node public/commendations ./site-assets/commendations
COPY --chown=node:node public/images/clan-crest-black.webp public/images/clan-crest-red.webp public/images/clan-crest-gold.webp ./site-assets/images/
COPY --chown=node:node public/game/war-leagues ./site-assets/game/war-leagues
USER node
EXPOSE 3001
CMD ["node", "server.js"]
