# mcp-bluecolumn

> Persistent memory infrastructure for AI agents. One MCP server, any client.

[![npm version](https://img.shields.io/npm/v/mcp-bluecolumn?logo=npm&color=orange)](https://www.npmjs.com/package/mcp-bluecolumn)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

---

## Quick Start

```bash
npx mcp-bluecolumn --api-key=bc_live_...
```

**30 seconds later**, your agent has persistent memory.

---

## What This Is

`mcp-bluecolumn` is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives any MCP-compatible client — Claude Desktop, Claude Code, Cursor, OpenClaw, Cline, Continue.dev — a **semantic memory system** that persists across sessions, conversations, and deployments.

**Without it:** Every conversation starts with a blank context window. Preferences, findings, and decisions from yesterday are gone.

**With it:** Your agent remembers last week's research, user preferences, meeting recordings — anything it stores, retrieved via natural-language semantic search.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Any MCP Client                         │
│  Claude Desktop · Claude Code · Cursor · OpenClaw       │
│  Cline · Continue.dev · Any MCP-compatible tool         │
└─────────────────────┬───────────────────────────────────┘
                      │ stdio transport
                      ▼
┌─────────────────────────────────────────────────────────┐
│              mcp-bluecolumn (MCP Server)                 │
│                                                         │
│  Tools:          Resources:          Prompts:            │
│  · remember      · bluecolumn://health  · agent guide   │
│  · recall        · bluecolumn://agent/*                  │
│  · list_sessions · bluecolumn://memory/*                 │
│  · create_session· bluecolumn://sessions/*               │
│  · write_note                                             │
│  · converse                                              │
│  · ingest_audio                                          │
│  · streaming_audio_ingest · streaming_audio_recall       │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS (JSON API)
                      ▼
┌─────────────────────────────────────────────────────────┐
│              BlueColumn Memory Service                   │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Vector Store   │  │  Metadata DB    │              │
│  │  (semantic idx) │  │  (tags, time)   │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
│  Embeddings generated at write time.                    │
│  Hybrid search: vector + keyword + temporal filters.    │
└─────────────────────────────────────────────────────────┘
```

---

## Installation

### npx (no install required)

```bash
npx mcp-bluecolumn --api-key=bc_live_...
```

### npm (global install)

```bash
npm install -g mcp-bluecolumn
mcp-bluecolumn --api-key=bc_live_...
```

### Environment variable

```bash
export BLUECOLUMN_API_KEY=bc_live_...
npx mcp-bluecolumn
```

---

## Configuration

### Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bluecolumn": {
      "command": "npx",
      "args": ["-y", "mcp-bluecolumn"],
      "env": {
        "BLUECOLUMN_API_KEY": "bc_live_..."
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bluecolumn": {
      "command": "npx",
      "args": ["-y", "mcp-bluecolumn"],
      "env": {
        "BLUECOLUMN_API_KEY": "bc_live_..."
      }
    }
  }
}
```

### Continue.dev

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "mcpServers": {
      "bluecolumn": {
        "command": "npx",
        "args": ["-y", "mcp-bluecolumn"],
        "env": {
          "BLUECOLUMN_API_KEY": "bc_live_..."
        }
      }
    }
  }
}
```

### OpenClaw

Add to `openclaw.json`:

```json
{
  "bluecolumn": {
    "apiKey": "bc_live_..."
  }
}
```

(OpenClaw integrates natively — no MCP config needed.)

---

## Tools

| Tool | What it does | Key params |
|------|-------------|------------|
| `remember` | Store a memory (auto-embeds + indexes) | `agent_id`, `content`, `tags?`, `ttl_seconds?` |
| `recall` | Semantic search across stored memories | `query`, `agent_id`, `top_k?`, `min_score?` |
| `list_sessions` | Browse conversation sessions | `agent_id`, `limit?`, `offset?` |
| `create_session` | Start a new session with context | `agent_id`, `context?`, `tags?` |
| `write_note` | Send an agent-to-agent note | `from_agent_id`, `content`, `to_agent_id?` |
| `converse` | Threaded multi-agent messaging | `from_agent_id`, `to_agent_id`, `content` |
| `ingest_audio` | Transcribe audio → searchable memory | `agent_id`, `file_path`, `language?` |
| `streaming_audio_ingest` | Ingest edge-device audio chunk → per-device streaming memory (Whisper + entities + intent, idempotent) | `device_id`, `audio_base64`, `format?`, `sample_rate?`, `idempotency_key?` |
| `streaming_audio_recall` | Recall over a device's streamed audio history | `device_id`, `query` |

### Usage examples

```bash
# Store a memory
agent → remember(agent_id="research-bot", content="User prefers dark mode", tags=["preference", "user-123"])

# Recall with semantic search
agent → recall(query="What theme does the user prefer?", agent_id="research-bot", top_k=5)

# Process a meeting recording
agent → ingest_audio(agent_id="meeting-bot", file_path="/path/to/meeting.mp3", tags=["standup", "2026-07-25"])
```

---

## Resources

| URI | Description |
|-----|-------------|
| `bluecolumn://health` | API health status |
| `bluecolumn://agent/{id}` | Agent details |
| `bluecolumn://memory/{id}` | Single memory record |
| `bluecolumn://sessions/{id}` | Session list for an agent |

---

## Framework Integrations

| Framework | Guide | Pattern |
|-----------|-------|---------|
| LangChain / LangGraph | [Integration Guide](../framework-integrations/langchain-integration.md) | `@tool`, `MultiServerMCPClient`, LangGraph Store |
| CrewAI | [Integration Guide](../framework-integrations/crewai-integration.md) | Custom `@tool` class, shared memory across crews |
| AutoGen | [Integration Guide](../framework-integrations/autogen-integration.md) | `FunctionTool`, `McpServerToolsAdapter`, `HttpTool` |

---

## API (Direct)

Prefer the REST API over MCP? Direct endpoints for scripting and non-MCP clients:

```bash
# Store
curl -X POST https://api.bluecolumn.ai/v1/remember \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "my-agent", "content": "Store this", "tags": ["test"]}'

# Recall
curl -X POST https://api.bluecolumn.ai/v1/recall \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "find this", "agent_id": "my-agent", "top_k": 5}'
```

**Full API reference:** [docs.bluecolumn.ai](https://bluecolumn.ai/docs)

---

## Agent Discovery

`mcp-bluecolumn` publishes AI-agent discovery files so coding agents can find and use BlueColumn autonomously:

| File | Purpose |
|------|---------|
| [`llms.txt`](../agent-discovery/llms.txt) | AI model discovery (Claude, ChatGPT, Gemini) |
| [`.well-known/agents.json`](../agent-discovery/.well-known/agents.json) | Agent API discovery (Wildcard AI spec) |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `401 Unauthorized` | Missing or invalid API key | Set `BLUECOLUMN_API_KEY` or pass `--api-key=` |
| `ECONNREFUSED` | API service unavailable | Check `api.bluecolumn.ai` status |
| `ETIMEOUT` | Slow network or large payload | Set `BLUECOLUMN_BASE_URL` to a closer region |
| `ToolNotFound` | Outdated version | Update: `npm update -g mcp-bluecolumn` |
| Agent not calling tools | Missing MCP config | Verify JSON config in client settings |
| Poor recall results | `top_k` too high or `min_score` too low | Try `top_k: 3-5` with `min_score: 0.7` |

---

## SDK Packages

| Package | Type | URL |
|---------|------|-----|
| `mcp-bluecolumn` | Node.js (MCP server) | [npmjs.com/package/mcp-bluecolumn](https://www.npmjs.com/package/mcp-bluecolumn) |
| `bluecolumn` (npm) | Node.js SDK | [npmjs.com/package/bluecolumn](https://www.npmjs.com/package/bluecolumn) |
| `bluecolumn` (pip) | Python SDK | [pypi.org/project/bluecolumn](https://pypi.org/project/bluecolumn/) |

---

## Changelog

### 1.0.0 (2026-07-25)
- Initial release
- 7 MCP tools: `remember`, `recall`, `list_sessions`, `create_session`, `write_note`, `converse`, `ingest_audio`
- MCP resources: health, agent detail, memory detail, session list
- System prompt for agent guidance
- Zod-based input validation
- Config via CLI args or environment variables

---

## Development

```bash
git clone https://github.com/bluecolumn/mcp-bluecolumn
cd mcp-bluecolumn
npm install
npm run dev  # watches + rebuilds
```

---

## License

MIT © BlueColumn

<p align="center">
  <a href="https://bluecolumn.ai">Website</a>
  ·
  <a href="https://bluecolumn.ai/docs">Docs</a>
  ·
  <a href="https://github.com/bluecolumn/mcp-bluecolumn">GitHub</a>
  ·
  <a href="https://www.npmjs.com/package/mcp-bluecolumn">npm</a>
</p>
