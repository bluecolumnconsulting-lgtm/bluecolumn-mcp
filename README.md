# 🧠 BlueColumn MCP Server

> **Give Claude Desktop, Cursor, and any MCP-compatible agent persistent memory across sessions.**

[![npm version](https://img.shields.io/npm/v/bluecolumn-mcp)](https://www.npmjs.com/package/bluecolumn-mcp)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![BlueColumn](https://img.shields.io/badge/BlueColumn-API-3B82F6)](https://bluecolumn.ai)

**2-minute setup.** Zero-config. Audio-native. Works with every MCP client.

---

MCP server for [BlueColumn](https://bluecolumn.ai) — persistent semantic memory for AI agents.

Give any MCP-compatible agent (Claude Desktop, Cursor, Windsurf, LangChain, AutoGen, CrewAI) the ability to remember, recall, and store observations across sessions.

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

### 4. Restart Claude

Done. Claude now remembers everything you tell it to.

## What Makes BlueColumn Different

| Feature | BlueColumn MCP | Other MCP Memory Servers |
|---------|---------------|--------------------------|
| **Audio ingestion** | ✅ Native (transcribe + store) | ❌ Text only |
| **Plain English recall** | ✅ "What did we decide about pricing?" | ❌ Keyword/vector only |
| **Setup time** | ~2 minutes | ~10-30 minutes |
| **Cloud managed** | ✅ No infra to run | ⚠️ Most require local DB |
| **Namespace isolation** | ✅ Built-in per key | ⚠️ Manual |

## Examples

### Store project context
```
Remember: We're building a React component library called Aether with Tailwind CSS v4.
```

### Recall across sessions (new conversation)
```
What project was I working on? What was my tech stack?
```
→ *Claude recalls: "You're building Aether, a React component library with Tailwind CSS v4"*

### Store audio notes
Record a voice memo → BlueColumn transcribes it → Claude remembers it.

## Advanced

### Custom namespace
```json
{
  "mcpServers": {
    "bluecolumn": {
      "command": "bluecolumn-mcp",
      "env": {
        "BLUECOLUMN_API_KEY": "bc_live_YOUR_KEY",
        "BLUECOLUMN_NAMESPACE": "my_project"
      }
    }
  }
}
```

### Multiple environments
Use different namespaces for work, personal, and side projects. Each stays isolated.

---

**[Sign up free →](https://bluecolumn.ai)** · **[Docs](https://bluecolumn.ai/docs)** · **[GitHub Issues](https://github.com/bluecolumnconsulting-lgtm/bluecolumn-mcp/issues)**
