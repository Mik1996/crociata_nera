# Angular frontend served by Caddy, which also terminates HTTPS and routes the APIs.

# --- build -------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
# Small VPS: give the build enough heap (swap covers the rest).
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY angular.json ngsw-config.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npx ng build --configuration production
# Emergency switch (SW_DISABLED=1 in deploy/.env, see README "Service worker"): the service worker
# is replaced by Angular's safety worker, which unregisters itself and deletes its caches in the
# browsers, and ngsw.json is dropped (a 404 makes an old worker remove itself too).
ARG SW_DISABLED=0
RUN if [ "$SW_DISABLED" = "1" ]; then \
      cp dist/crociata_nera/browser/safety-worker.js dist/crociata_nera/browser/ngsw-worker.js && \
      rm dist/crociata_nera/browser/ngsw.json; \
    fi

# --- runtime -----------------------------------------------------------------
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/crociata_nera/browser /srv
