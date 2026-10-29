# Complete reviewed runtime; build web/dist with the same revision before this image.
FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/Mirksen/blockchainSimulacrum" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
WORKDIR /app
COPY --chown=1000:1000 server/package.json /app/package.json
COPY --chown=1000:1000 server/src/ /app/src/
COPY --chown=1000:1000 server/data/ /app/data/
COPY --chown=1000:1000 web/dist/ /static/
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/leaderboard.sqlite STATIC_DIR=/static
USER 1000:1000
CMD ["node", "src/main.js"]
