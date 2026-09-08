# Changelog

## 1.4.0 — Music Memory tools (2026-09)

- New tool `music_remember` — store a musical recording, practice session, or
  lesson with rich musical context (instrument, key, tempo, technique tags,
  chord progression, notes). Audio is transcribed via Whisper; structured
  context is serialized into the stored text so recall comes back with full
  musical understanding. Works today via the core memory API (`agent-remember`).
- New tool `music_recall` — search stored musical content with musical filters
  (instrument, technique_tags, style_tags). Filter hints are appended to the
  query so recall scopes to music. Returns AI-synthesized answers + citations.

## 1.3.0 — Package hardening (2026-09)

- Registry metadata, packaging, and bin fixes.

## 1.2.0 — Streaming audio memory (2026-08-24)

- New tool `streaming_audio_ingest` — POST /streaming-audio. Ingest edge-device
  audio chunks (car, doorbell, wearable) into per-device streaming memory.
  Whisper large-v3 transcription, Claude entity extraction + intent
  classification, Postgres-backed idempotency (`chunk_<device>_<ts>_<hash>`
  auto-generated when omitted).
- New tool `streaming_audio_recall` — POST /streaming-audio/query. Recall over
  a device's streamed audio history (segments + session summaries).
- Config: `BLUECOLUMN_STREAMING_URL` override; streaming base derived from the
  API base URL by stripping `/v1` (the gateway lives at the platform root).

## 1.1.0 — Audio Intelligence layer (2026-08)

- Six tools: `audio_ingest`, `call_prepare`, `call_complete`, `audio_recall`,
  `sound_analyze`, `music_analyze`. Routed via `BLUECOLUMN_API_URL`.

## 1.0.0 — Initial release (2026-07)

- `remember`, `recall`, `note`, `namespace`.
