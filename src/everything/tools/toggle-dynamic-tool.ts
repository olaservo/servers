import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Track call count per session
const callCount = new Map<string | undefined, number>();

/**
 * Toggle Dynamic Tool
 *
 * Demonstrates the `notifications/tools/list_changed` notification.
 * Each call increments a counter and sends the notification using
 * the SDK's built-in sendToolListChanged() method.
 */
export const registerToggleDynamicToolTool = (server: McpServer) => {
  server.registerTool(
    "toggle-dynamic-tool",
    {
      title: "Toggle Dynamic Tool",
      description: "Sends tools/list_changed notification using SDK's sendToolListChanged()",
    },
    async () => {
      const sessionId = server.server.transport?.sessionId;
      const count = (callCount.get(sessionId) ?? 0) + 1;
      callCount.set(sessionId, count);

      // Use the SDK's built-in method to send the notification
      await server.server.sendToolListChanged();

      return {
        content: [
          {
            type: "text" as const,
            text: `Call #${count}: Used server.sendToolListChanged() to notify client. Client should re-fetch tool list.`,
          },
        ],
      };
    }
  );
};
