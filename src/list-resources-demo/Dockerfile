# Image for the list-resources-demo MCP server. The forked SDK is pulled from
# npm (@olaservo/mcp-sdk, aliased as @modelcontextprotocol/sdk), so the build
# context is just this package directory — ideal for a Hugging Face Docker Space.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json index.ts ./
COPY server ./server
COPY resources ./resources
COPY transports ./transports
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# Served as a static resource (demo://docs/readme.md), so it must exist at runtime.
COPY README.md ./

# Hugging Face Spaces route external traffic to this port (see README app_port).
ENV PORT=7860
EXPOSE 7860
CMD ["node", "dist/index.js", "streamableHttp"]
