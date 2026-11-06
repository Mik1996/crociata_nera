# Clash of Clans proxy (server/): plain Node, no dependencies.
FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node server ./server
# War archive and monthly history live in a volume mounted here.
RUN mkdir -p server/data && chown node:node server/data
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.mjs"]
