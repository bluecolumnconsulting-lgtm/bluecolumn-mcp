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

### Core memory

| Tool | Description |
|---|---|
| `remember` | Ingest text, audio, or documents into persistent memory |
| `recall` | Query memory with natural language, get AI-synthesized answer + sources |
| `note` | Store lightweight agent observations as searchable vectors |
| `namespace` | Show the configured namespace |

### Music Memory (new)

| Tool | Description |
|---|---|
| `music_remember` | Store a musical recording, practice session, or lesson with rich musical context — instrument, key, tempo, technique tags, chord progression, notes. Audio is transcribed; the structured context is embedded alongside so a coach/teacher agent recalls it with full musical understanding |
| `music_recall` | Search stored musical content with musical filters — instrument, technique, or style. E.g. "show me every take with barre chord issues" or "what did we practice in E minor last month" |

### Audio Intelligence

| Tool | Description |
|---|---|
| `audio_ingest` | Ingest calls, voice notes, podcasts, meetings, or music and extract semantic memory |
| `audio_recall` | Search audio memories and get audio-backed citations |
| `call_prepare` | Get memory context before a voice call starts |
| `call_complete` | Store what changed after a call ends |
| `sound_analyze` | Detect and index non-speech audio events |
| `music_analyze` | Extract tempo, structure, instrumentation, mood from music |

### Streaming audio memory

| Tool | Description |
|---|---|
| `streaming_audio_ingest` | Ingest edge-device audio chunks (car, doorbell, wearable) into per-device streaming memory |
| `streaming_audio_recall` | Recall over a device's streamed audio history |

## Music Memory example

Store a practice session:

```
music_remember {
  "audio_url": "https://example.com/take3.mp3",
  "title": "Week 3 practice — barre chords, Sep 7",
  "instrument": "guitar",
  "musical_key": "E minor",
  "tempo_bpm": 92,
  "technique_tags": ["barre-chords", "hammer-on"],
  "style_tags": ["blues"],
  "chord_progression": ["Em", "Am", "B7"],
  "notes": "F-shape barre still buzzy on the B string; Fmaj7 subst worked well"
}
```

Then recall it musically:

```
music_recall { "q": "which takes had barre chord issues?", "instrument": "guitar" }
```

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
