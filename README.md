# bluecolumn-mcp

MCP server for [BlueColumn](https://bluecolumn.ai) — persistent semantic memory for AI agents.

Give any MCP-compatible agent (Claude Desktop, LangChain, AutoGen, CrewAI) the ability to remember, recall, and store observations across sessions.

## Tools

| Tool | Description |
|---|---|
| `remember` | Ingest text, audio, or documents into persistent memory |
| `recall` | Query memory with natural language, get AI-synthesized answer + sources |
| `note` | Store lightweight agent observations as searchable vectors |

## Setup

### 1. Get your BlueColumn API key

Sign up free at [bluecolumn.ai](https://bluecolumn.ai) — 60 min audio + 100 queries/month, no credit card required.

### 2. Install

```bash
npm install -g bluecolumn-mcp
```

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bluecolumn": {
      "command": "bluecolumn-mcp",
      "env": {
        "BLUECOLUMN_API_KEY": "bc_live_YOUR_KEY"
      }
    }
  }
}
```

Restart Claude Desktop. Your agent now has persistent memory.

## Usage

Once configured, your agent can:

```
Remember this: our API uses Voyage AI embeddings at 512 dimensions
→ Uses the `remember` tool automatically

What embedding model does our API use?
→ Uses the `recall` tool to query memory

Note: user prefers bullet points over paragraphs
→ Uses the `note` tool for quick observations
```

## Example with LangChain

```python
from langchain_mcp import MCPToolkit

toolkit = MCPToolkit(server_name="bluecolumn")
tools = toolkit.get_tools()
# Tools: remember, recall, note — all backed by BlueColumn
```

## Pricing

| Plan | Price | Audio | Queries |
|---|---|---|---|
| Free | $0 | 60 min/mo | 100/mo |
| Developer | $29/mo | 600 min | 2,000 |
| Builder | $79/mo | 2,000 min | 8,000 |
| Scale | $249/mo | 6,000 min | 20,000 |

## Links

- [bluecolumn.ai](https://bluecolumn.ai)
- [API Documentation](https://bluecolumn.ai/docs)
- [GitHub](https://github.com/bluecolumn/bluecolumn-mcp)
