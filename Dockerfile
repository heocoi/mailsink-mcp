# Multi-stage Dockerfile for the MailSink MCP server.
# Used by Glama's submission checks so the server can start and respond to
# MCP introspection (initialize, tools/list) without a live MAILSINK_API_KEY.

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# MCP servers communicate over stdio. MAILSINK_API_KEY is required to call
# MailSink APIs at tool-invocation time, but NOT needed for introspection.
ENV MAILSINK_API_KEY=""

ENTRYPOINT ["node", "dist/index.js"]
