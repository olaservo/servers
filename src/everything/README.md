# Everything MCP Server
**[Architecture](docs/architecture.md)
| [Project Structure](docs/structure.md)
| [Startup Process](docs/startup.md)
| [Server Features](docs/features.md)
| [Extension Points](docs/extension.md)
| [How It Works](docs/how-it-works.md)**


This MCP server attempts to exercise all the features of the MCP protocol. It is not intended to be a useful server, but rather a test server for builders of MCP clients. It implements prompts, tools, resources, sampling, and more to showcase MCP capabilities.

## Tools, Resources, Prompts, and Other Features

A complete list of the registered MCP primitives and other protocol features demonstrated can be found in the [Server Features](docs/features.md) document.

## Experimental: full JSON Schema 2020-12 tool inputs (SEP-2106)

This build runs on the 2.0 SDK (`@modelcontextprotocol/server@2.0.0-alpha.2`) to demonstrate capabilities from recently finalized SEPs:

- **[SEP-2106](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2106-json-schema-2020-12.md)** (Final) removes the old `type`/`properties`/`required` restriction on tool `inputSchema`/`outputSchema`, allowing the full JSON Schema 2020-12 vocabulary. The `get-enum-selections` tool uses the SDK's `fromJsonSchema` adapter to advertise — and strictly validate against — every [SEP-1330](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1330) enum variety as a **tool input**: untitled single/multi-select (`enum`), titled single-select (`oneOf` of `{const, title}`), titled multi-select (`items.anyOf`), and the legacy `enumNames` form. The titled and `enumNames` shapes were not expressible in a tool input before SEP-2106 (previously only reachable via elicitation `requestedSchema`).
- The Streamable HTTP transport runs **stateless** (no `Mcp-Session-Id`), following **[SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2575-stateless-mcp.md)** (Make MCP Stateless) and **[SEP-2567](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/2567-sessionless-mcp.md)** (Sessionless MCP).

> The SDK dependency is pinned to `2.0.0-alpha.2` deliberately: it is the last alpha that still ships the experimental tasks API (removed by SEP-2663 in the next release), which the task demo tools rely on. Expect API churn while the 2.0 SDK is in alpha.

## Usage with Claude Desktop (uses [stdio Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#stdio))

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-everything"
      ]
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@modelcontextprotocol/server-everything"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

#### NPX

```json
{
  "servers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

On Windows, use:

```json
{
  "servers": {
    "everything": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

## Run from source with [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)

```shell
cd src/everything
npm install
npm run start:streamableHttp
```

## Running as an installed package
### Install 
```shell
npm install -g @modelcontextprotocol/server-everything@latest
````

### Run the default (stdio) server
```shell
npx @modelcontextprotocol/server-everything
```

### Or specify stdio explicitly
```shell
npx @modelcontextprotocol/server-everything stdio
```

### Run the streamable HTTP server
```shell
npx @modelcontextprotocol/server-everything streamableHttp
```
