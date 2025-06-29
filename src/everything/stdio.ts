#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./everything.js";

console.error('Starting default (STDIO) server...');

async function main() {
  const transport = new StdioServerTransport();
  const {server, cleanup, startBackgroundTasks} = createServer();

  await server.connect(transport);

  // Start background notification tasks AFTER the server is connected
  startBackgroundTasks();

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await cleanup();
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
