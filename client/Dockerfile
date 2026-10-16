# Oira bridge, the API-only container on the VPS. Netlify serves the app; this serves /api.
# The deployer key comes from OIRA_DEPLOYER_KEY at run time and is never baked in.
#
# Build from the repo root so client/, mcp/ and app/ sit side by side under /app the way
# server.mjs expects (the concierge loads app/concierge.js):
#   docker build -f client/Dockerfile -t oira-bridge:<tag> .
#
# The base is pinned by digest. To take a newer node:20-slim, look up its digest, change it
# here and rebuild; do not go back to the bare tag.
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY client/ ./client/
COPY mcp/ ./mcp/
COPY app/ ./app/
# campaign-store.mjs writes campaigns.json next to the code, so the app folder belongs to the
# runtime user. Caches go to /tmp.
RUN chown -R node:node /app
USER node
ENV OIRA_HOST=0.0.0.0 \
    OIRA_PORT=8778 \
    OIRA_SERVE_STATIC=0
WORKDIR /app/client
EXPOSE 8778
CMD ["node", "server.mjs"]
