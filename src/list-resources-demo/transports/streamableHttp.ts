import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Express, Request, Response } from "express";
import { createServer, CreateServerOptions } from "../server/index.js";
import { randomUUID } from "node:crypto";
import cors from "cors";

console.error("Starting list-resources-demo (Streamable HTTP) server...");

const app = express();

// Permissive CORS so the MCP Inspector / browser clients can connect directly.
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
  })
);

// Optional DNS-rebinding protection for public deployments (e.g. a Hugging Face
// Space). Set ALLOWED_HOSTS to a comma-separated list, e.g.
// "olaservo-mcp-list-resources-demo.hf.space". Left unset, protection is off.
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const dnsRebindingOptions =
  allowedHosts.length > 0
    ? { enableDnsRebindingProtection: true, allowedHosts }
    : {};

// Each endpoint serves the same resource tree with a different resources/read
// directory behavior, so all three listing approaches are live at once:
//   /mcp          -> read a directory returns ResourceContents[] (A, current)
//   /mcp/listing  -> read a directory returns Resource[] listing  (C, single-RPC)
// resources/directory/read (B, proposed) is available on both.
const ENDPOINTS: { path: string; label: string; options: CreateServerOptions }[] = [
  {
    path: "/mcp",
    label: "A current (read dir -> ResourceContents[]) + B proposed (resources/directory/read)",
    options: { readDirectoryReturnsListing: false },
  },
  {
    path: "/mcp/listing",
    label: "C single-RPC (read dir -> Resource[]) + B proposed (resources/directory/read)",
    options: { readDirectoryReturnsListing: true },
  },
];

// Health check + endpoint directory.
app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: "list-resources-demo",
    endpoints: ENDPOINTS.map((e) => ({ path: e.path, label: e.label })),
    dnsRebindingProtection: allowedHosts.length > 0,
    allowedHosts,
    observed: {
      host: req.headers["host"] ?? null,
      "x-forwarded-host": req.headers["x-forwarded-host"] ?? null,
      origin: req.headers["origin"] ?? null,
    },
  });
});

const allTransports: Map<string, StreamableHTTPServerTransport>[] = [];

// Mount the POST/GET/DELETE handlers for one endpoint, with its own session map
// and server options.
function mount(app: Express, path: string, options: CreateServerOptions): void {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  allTransports.push(transports);

  app.post(path, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && transports.has(sessionId)) {
        await transports.get(sessionId)!.handleRequest(req, res);
        return;
      }

      if (!sessionId) {
        const { server, cleanup } = createServer(options);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          ...dnsRebindingOptions,
          onsessioninitialized: (sid: string) => {
            transports.set(sid, transport);
          },
        });

        server.server.onclose = async () => {
          const sid = transport.sessionId;
          if (sid && transports.has(sid)) {
            transports.delete(sid);
            cleanup(sid);
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: req?.body?.id,
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: req?.body?.id,
        });
      }
    }
  });

  const requireSession = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: req?.body?.id,
      });
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  };

  app.get(path, requireSession);
  app.delete(path, requireSession);
}

for (const e of ENDPOINTS) mount(app, e.path, e.options);

const PORT = Number(process.env.PORT) || 7860;
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.error(`MCP Streamable HTTP server listening on 0.0.0.0:${PORT}`);
  for (const e of ENDPOINTS) console.error(`  POST ${e.path} — ${e.label}`);
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Failed to start: port ${PORT} is already in use.`);
  } else {
    console.error("HTTP server error:", err);
  }
  process.exit(1);
});

process.on("SIGINT", async () => {
  for (const transports of allTransports) {
    for (const [sid, transport] of transports) {
      try {
        await transport.close();
      } catch {
        // ignore
      }
      transports.delete(sid);
    }
  }
  process.exit(0);
});
