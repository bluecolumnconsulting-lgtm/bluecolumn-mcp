# MCP Server Update: BlueColumn Persistent Memory

## Server Details
- **Name:** BlueColumn Persistent Memory (Updated)
- **Repository:** https://github.com/bluecolumnconsulting-lgtm/bluecolumn-mcp
- **Documentation:** https://docs.bluecolumn.ai/mcp
- **Status:** Production Ready
- **Version:** 1.1.0 (previously 1.0.1)

## What's New

Added **Audio Intelligence Layer** on top of the existing persistent memory API:

### Core Memory API (Existing — unchanged)
- `remember` — Store text, document URLs, or audio URLs into persistent vector memory
- `recall` — Query memory with natural language; returns AI-synthesized answers with citations
- `note` — Fast lightweight observations with tags
- `namespace` — Show the configured namespace

### Audio Intelligence (NEW)
- `audio_ingest` — Ingest calls, podcasts, music; auto-extract memories
- `call_prepare` — Get customer context before voice calls
- `call_complete` — Store post-call learnings
- `audio_recall` — Search audio memories with audio evidence clips
- `sound_analyze` — Detect alarms, doors, silence, etc.
- `music_analyze` — Extract tempo, key, structure, instrumentation

## Backward Compatibility
✅ All existing `remember` / `recall` / `note` / `namespace` tools unchanged
✅ Existing integrations continue to work
✅ New tools are additions, not replacements
✅ Audio memories stored in the same vector backend as other memories

## Configuration
- Requires BlueColumn API key (`BLUECOLUMN_API_KEY`)
- `BLUECOLUMN_API_URL` (optional) — points the audio tools at the BlueColumn API
  (defaults to `http://localhost:8000`, the local FastAPI backend)
- Optionally configure transcription provider (Groq Whisper, Deepgram, OpenAI), music analysis model, real-time WebSocket support

## Installation
```
npm install @bluecolumn/mcp-server@1.1.0
```

## Support
- Docs: https://docs.bluecolumn.ai
- Audio Docs: https://docs.bluecolumn.ai/audio-intelligence
- Issues: https://github.com/bluecolumnconsulting-lgtm/bluecolumn-mcp/issues
