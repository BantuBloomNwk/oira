FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
# The readings live on a volume mounted at /data; the container itself is read only.
USER node
ENV PORT=8779 STUDY_DATA=/data/study.jsonl
EXPOSE 8779
CMD ["node", "server.mjs"]
