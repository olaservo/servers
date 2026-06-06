import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import express, { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createServer } from "../server/index.js";
import { randomUUID } from "node:crypto";
import cors from "cors";

console.error("Starting Streamable HTTP server...");

// Express app with permissive CORS for testing with Inspector direct connect mode
const app = express();
app.use(
  cors({
    origin: "*", // use "*" with caution in production
    methods: "GET,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);

// The 2.0 SDK ships a single Web Standard transport that manages sessions
// internally, so one server + transport pair handles every client.
const { server, cleanup } = createServer();
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});
await server.connect(transport);

// Buffer the raw request body from an Express request.
function readRawBody(req: ExpressRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Bridges an Express request/response to the Web Standard transport.
 *
 * The 2.0 transport's `handleRequest` consumes a Web `Request` and returns a Web
 * `Response`, so we translate to/from Express here. Web globals are accessed via
 * `globalThis` (and typed loosely) to avoid pulling the DOM lib into tsconfig.
 */
async function handleMcpRequest(
  req: ExpressRequest,
  res: ExpressResponse
): Promise<void> {
  const url = `http://${req.headers.host ?? "localhost"}${req.originalUrl}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers = new (globalThis as any).Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value != null) {
      headers.set(key, String(value));
    }
  }

  let body: Buffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const raw = await readRawBody(req);
    body = raw.length > 0 ? raw : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webRequest = new (globalThis as any).Request(url, {
    method: req.method,
    headers,
    body,
    duplex: "half", // required by Node when streaming a request body
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webResponse: any = await transport.handleRequest(webRequest);

  res.status(webResponse.status);
  webResponse.headers.forEach((value: string, key: string) =>
    res.setHeader(key, value)
  );

  if (!webResponse.body) {
    res.end();
    return;
  }

  // Stream the (possibly SSE) response body back through Express.
  const reader = webResponse.body.getReader();
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } finally {
    res.end();
  }
}

// Handle GET (SSE), POST (messages), and DELETE (session termination) on /mcp.
app.all("/mcp", (req: ExpressRequest, res: ExpressResponse) => {
  handleMcpRequest(req, res).catch((error) => {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    } else {
      res.end();
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
const httpServer = app.listen(PORT, () => {
  console.error(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// Handle server errors
httpServer.on("error", (err: unknown) => {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code === "EADDRINUSE") {
    console.error(
      `Failed to start: Port ${PORT} is already in use. Set PORT to a free port or stop the conflicting process.`
    );
  } else {
    console.error("HTTP server encountered an error while starting:", err);
  }
  process.exit(1);
});

// Handle server shutdown
process.on("SIGINT", async () => {
  console.error("Shutting down server...");
  await server.close();
  cleanup();
  console.error("Server shutdown complete");
  process.exit(0);
});
