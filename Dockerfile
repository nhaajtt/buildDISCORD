FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
