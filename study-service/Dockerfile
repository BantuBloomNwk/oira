# Pinned by digest; bump it deliberately rather than going back to the bare tag.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app
COPY server.mjs ./
# The readings live on a volume mounted at /data; the container itself is read only.
USER node
ENV PORT=8779 STUDY_DATA=/data/study.jsonl
EXPOSE 8779
CMD ["node", "server.mjs"]
