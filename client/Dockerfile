# Oira bridge — API-only container for a persistent host (VPS). The static app is served
# by Netlify; this runs just the proven devnet /api flows. Deployer key comes from the
# OIRA_DEPLOYER_KEY env (never baked into the image).
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY oira-chain.mjs server.mjs payout-config.json ./
ENV OIRA_HOST=0.0.0.0 \
    OIRA_PORT=8778 \
    OIRA_SERVE_STATIC=0
EXPOSE 8778
CMD ["node", "server.mjs"]
