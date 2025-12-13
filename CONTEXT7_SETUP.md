# Context7 MCP Setup Guide

Context7 is a Model Context Protocol (MCP) server that provides up-to-date, version-specific documentation directly into your AI coding assistant.

## Installation for Cursor

1. **Get your Context7 API Key:**
   - Visit [context7.com/dashboard](https://context7.com/dashboard)
   - Create an account and obtain your API key

2. **Configure in Cursor:**
   - Open Cursor Settings
   - Navigate to: `Settings` → `Cursor Settings` → `MCP` → `Add new global MCP server`
   - Add the following configuration:

```json
{
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp",
      "type": "streamableHttp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

   Replace `YOUR_API_KEY` with your actual Context7 API key.

3. **Alternative: Local Server Configuration**

If you prefer to run Context7 locally:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "YOUR_API_KEY"]
    }
  }
}
```

## Usage

Once configured, you can use Context7 in your prompts by adding `use context7`:

```
Show me the latest MediaPipe JavaScript documentation for pose detection. use context7
```

This will fetch the most current MediaPipe documentation and code examples.

## Resources

- [Context7 Installation Guide](https://context7.com/docs/installation)
- [Context7 Documentation](https://context7.com/docs/overview)
- [Get API Key](https://context7.com/dashboard)

