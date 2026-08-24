# Changelog

All notable changes to `mcp-bluecolumn` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-25

### Added

- **Initial MCP server release** — seven tools, four resources, stdio transport
- `remember` — store a memory with semantic embedding, tags, metadata, and optional TTL
- `recall` — search memories via natural language with tag and time-range filters
- `list_recent_memories` — paginated listing with namespace filtering
- `list_namespaces` — enumerate all agent namespaces
- `delete_memory` — remove a specific memory by ID
- `write_note` — post ephemeral or persistent notes visible to other agents
- `converse` — structured async messaging between agents
- **Configuration** — CLI flags (`--api-key`, `--api-url`) and environment variables (`BLUECOLUMN_API_KEY`, `BLUECOLUMN_API_URL`)
- **Zero-dependency runtime** — only MCP SDK, cross-fetch, and zod
- **Full documentation** — README with architecture diagram, 30s setup, 4 MCP client configs, troubleshooting table
- **Agent discovery** — `llms.txt`, `agents.json`, `mcp-manifest.json`, `.well-known/mcp.json`
- **Framework integration guides** — LangChain, CrewAI, AutoGen (3 patterns each)
- **Agent setup guides** — Claude Desktop, Claude Code, Cursor, Continue.dev, OpenClaw (7 files)
- **Educational content** — "Agent Memory 101" technical primer
- **OpenAPI spec** — full REST API schema for GPT Actions and direct API usage

## 1.1.0 — Streaming audio memory (2026-08-24)

- New tool `streaming_audio_ingest` — POST /streaming-audio. Ingest edge-device audio chunks
  (car, doorbell, wearable) into per-device streaming memory. Whisper large-v3 transcription,
  Claude entity extraction + intent classification, Postgres-backed idempotency.
- New tool `streaming_audio_recall` — POST /streaming-audio/query. Recall over a device's
  streamed audio history (segments + session summaries).
- Config: `BLUECOLUMN_STREAMING_BASE_URL` override; streaming base auto-derived by stripping
  `/v1` from the API base URL (gateway lives at the platform root).
- Idempotency keys auto-generated as `chunk_<deviceId>_<ts>_<sha256-12>` when omitted.
