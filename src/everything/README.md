# Everything MCP Server

This MCP server attempts to exercise all the features of the MCP protocol. It is not intended to be a useful server, but rather a test server for builders of MCP clients. It implements prompts, tools, resources, sampling, and more to showcase MCP capabilities.

## Components

### Tools

1. `echo`
   - Simple tool to echo back input messages
   - Input:
     - `message` (string): Message to echo back
   - Returns: Text content with echoed message

2. `add`
   - Adds two numbers together
   - Inputs:
     - `a` (number): First number
     - `b` (number): Second number
   - Returns: Text result of the addition

3. `longRunningOperation`
   - Demonstrates progress notifications for long operations
   - Inputs:
     - `duration` (number, default: 10): Duration in seconds
     - `steps` (number, default: 5): Number of progress steps
   - Returns: Completion message with duration and steps
   - Sends progress notifications during execution

4. `sampleLLM`
   - Demonstrates LLM sampling capability using MCP sampling feature
   - Inputs:
     - `messages` (array): Array of messages to send to the LLM, each containing:
       - `role` (enum: "user" | "assistant"): The role of the message sender
       - `content` (object): Either text or image content:
         - Text content:
           - `type: "text"`
           - `text` (string): The text content
           - `annotations` (optional): Audience and priority metadata
         - Image content:
           - `type: "image"`
           - `data` (string): Base64-encoded image data
           - `mimeType` (string): Image MIME type
           - `annotations` (optional): Audience and priority metadata
     - `maxTokens` (number): Maximum tokens to generate
     - `modelPreferences` (object, optional):
       - `hints` (array, optional): Model name hints in order of preference
       - `costPriority` (number, 0-1, optional): Priority for minimizing costs
       - `speedPriority` (number, 0-1, optional): Priority for minimizing latency
       - `intelligencePriority` (number, 0-1, optional): Priority for model capabilities
     - `systemPrompt` (string, optional): Optional system prompt override
     - `includeContext` (enum: "none" | "thisServer" | "allServers", optional): Whether to include MCP server context
     - `temperature` (number, optional): Controls randomness in the output
     - `stopSequences` (array of strings, optional): List of sequences that will stop generation
     - `metadata` (record, optional): Optional provider-specific metadata
   - Returns:
     - Model name used for generation
     - Generated content (text or image)
     - Optional stop reason ("endTurn", "stopSequence", "maxTokens", or other)

5. `getTinyImage`
   - Returns a small test image
   - No inputs required
   - Returns: Base64 encoded PNG image data

6. `printEnv`
   - Prints all environment variables
   - Useful for debugging MCP server configuration
   - No inputs required
   - Returns: JSON string of all environment variables

7. `annotatedMessage`
   - Demonstrates how annotations can be used to provide metadata about content
   - Inputs:
     - `messageType` (enum: "error" | "success" | "debug"): Type of message to demonstrate different annotation patterns
     - `includeImage` (boolean, default: false): Whether to include an example image
   - Returns: Content with varying annotations:
     - Error messages: High priority (1.0), visible to both user and assistant
     - Success messages: Medium priority (0.7), user-focused
     - Debug messages: Low priority (0.3), assistant-focused
     - Optional image: Medium priority (0.5), user-focused
   - Example annotations:
     ```json
     {
       "priority": 1.0,
       "audience": ["user", "assistant"]
     }
     ```

### Resources

The server provides 100 test resources in two formats:
- Even numbered resources:
  - Plaintext format
  - URI pattern: `test://static/resource/{even_number}`
  - Content: Simple text description

- Odd numbered resources:
  - Binary blob format
  - URI pattern: `test://static/resource/{odd_number}`
  - Content: Base64 encoded binary data

Resource features:
- Supports pagination (10 items per page)
- Allows subscribing to resource updates
- Demonstrates resource templates
- Auto-updates subscribed resources every 5 seconds

### Prompts

1. `simple_prompt`
   - Basic prompt without arguments
   - Returns: Single message exchange

2. `complex_prompt`
   - Advanced prompt demonstrating argument handling
   - Required arguments:
     - `temperature` (number): Temperature setting
   - Optional arguments:
     - `style` (string): Output style preference
   - Returns: Multi-turn conversation with images

## Usage with Claude Desktop

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
