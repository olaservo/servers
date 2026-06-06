import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { createServer } from "../server/index.js";
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
// "olaservo-list-resources-demo.hf.space". Left unset, protection is disabled.
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const dnsRebindingOptions =
  allowedHosts.length > 0
    ? { enableDnsRebindingProtection: true, allowedHosts }
    : {};

// Health check (Hugging Face pings the container; humans can sanity-check it too).
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "list-resources-demo", endpoint: "/mcp" });
});

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res);
      return;
    }

    if (!sessionId) {
      // New session: spin up a server + transport.
      const { server, cleanup } = createServer();
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

// GET (server-initiated SSE stream) and DELETE (session teardown) for an
// established session.
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

app.get("/mcp", requireSession);
app.delete("/mcp", requireSession);

const PORT = Number(process.env.PORT) || 7860;
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.error(`MCP Streamable HTTP server listening on 0.0.0.0:${PORT} (POST /mcp)`);
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
  for (const [sid, transport] of transports) {
    try {
      await transport.close();
    } catch {
      // ignore
    }
    transports.delete(sid);
  }
  process.exit(0);
});
