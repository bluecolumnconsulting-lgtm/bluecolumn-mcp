#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";

const BASE_URL = "https://xkjkwqbfvkswwdmbtndo.supabase.co/functions/v1";
const NAMESPACE = process.env.BLUECOLUMN_NAMESPACE || "nl";
const API_KEY = process.env.BLUECOLUMN_API_KEY;

if (!API_KEY) {
  console.error("Error: BLUECOLUMN_API_KEY environment variable is required.");
  console.error("Get your free API key at https://bluecolumn.ai");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function callBlueColumn(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ namespace: NAMESPACE, ...body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BlueColumn API error (${res.status}): ${err}`);
  }
  return res.json();
}

// Audio-intelligence layer (v1.1.0) — routed to the BlueColumn API. Override the
// target with BLUECOLUMN_API_URL (defaults to the local FastAPI backend, which now
// serves /v1/audio/*, /v1/calls/*, /v1/sound/*, /v1/music/*).
const AUDIO_API_BASE = process.env.BLUECOLUMN_API_URL || "http://localhost:8000";

async function callAudioApi(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${AUDIO_API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BlueColumn Audio API error (${res.status}): ${err}`);
  }
  return res.json();
}

// Streaming gateway (v1.2.0) — POST /streaming-audio lives at the platform
// root, not under /v1. Override with BLUECOLUMN_STREAMING_URL.
const STREAMING_BASE_URL =
  process.env.BLUECOLUMN_STREAMING_URL || BASE_URL.replace(/\/v1$/, "");

async function callStreamingApi(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${STREAMING_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BlueColumn Streaming API error (${res.status}): ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "bluecolumn-mcp", version: "1.4.0" },
  { capabilities: { tools: {} } }
);

// Compose a structured music-context text block from typed fields. The live
// /agent-remember endpoint takes free text + audio_url, so we serialize the
// music metadata into the stored text — it gets chunked, embedded, and comes
// back through recall with full context attached.
function composeMusicContext(a: {
  instrument?: string;
  technique_tags?: string[];
  style_tags?: string[];
  musical_key?: string;
  tempo_bpm?: number;
  chord_progression?: string[];
  notes?: string;
}): string {
  const parts: string[] = [];
  if (a.instrument) parts.push(`Instrument: ${a.instrument}`);
  if (a.musical_key) parts.push(`Key: ${a.musical_key}`);
  if (a.tempo_bpm) parts.push(`Tempo: ${a.tempo_bpm} BPM`);
  if (a.technique_tags?.length) parts.push(`Techniques: ${a.technique_tags.join(", ")}`);
  if (a.style_tags?.length) parts.push(`Styles: ${a.style_tags.join(", ")}`);
  if (a.chord_progression?.length) parts.push(`Chord progression: ${a.chord_progression.join(" → ")}`);
  if (a.notes) parts.push(`Notes: ${a.notes}`);
  return parts.length ? `MUSIC CONTEXT — ${parts.join(" | ")}` : "";
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "remember",
      description:
        "Store text, a document URL, or audio URL into BlueColumn persistent memory. Returns a summary, action items, and key topics automatically extracted by AI. Use when the user or agent wants to save information for future recall.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Raw text content to store in memory",
          },
          audio_url: {
            type: "string",
            description: "URL to an audio file (will be transcribed via Whisper)",
          },
          file_url: {
            type: "string",
            description: "URL to a PDF or document",
          },
          title: {
            type: "string",
            description: "Optional title for this memory (include date for best recall)",
          },
        },
      },
    },
    {
      name: "namespace",
      description:
        "Get the BlueColumn namespace this MCP server is configured to write/read (default: nl).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "recall",
      description:
        "Query BlueColumn memory using natural language. Returns an AI-synthesized answer with source citations. Use when the agent needs to retrieve past information, answer questions about stored content, or get context from previous sessions.",
      inputSchema: {
        type: "object",
        required: ["q"],
        properties: {
          q: {
            type: "string",
            description: "Natural language query to search memory",
          },
        },
      },
    },
    {
      name: "music_remember",
      description:
        "NEW (Music Memory): Store a musical recording, practice session, or lesson with rich musical context — instrument, key, tempo, technique tags, chord progression, and free-form notes — into BlueColumn. Audio is transcribed; the structured context is embedded alongside so a coach/teacher agent can recall it with full musical understanding. Works today via the core memory API; dedicated music endpoints arrive with the music release.",
      inputSchema: {
        type: "object",
        properties: {
          audio_url: {
            type: "string",
            description: "URL to the recording (WAV/MP3/etc). Transcribed via Whisper.",
          },
          text: {
            type: "string",
            description: "Free-form description when there is no recording (e.g. notation or a lesson summary)",
          },
          title: {
            type: "string",
            description: "Title for this memory, include date for best recall (e.g. 'Week 3 practice — barre chords, Sep 7')",
          },
          instrument: { type: "string", description: "e.g. guitar, piano, bass, drums" },
          musical_key: { type: "string", description: "e.g. 'E minor', 'Bb major'" },
          tempo_bpm: { type: "number", description: "e.g. 92" },
          technique_tags: {
            type: "array",
            items: { type: "string" },
            description: "e.g. ['barre-chords', 'hammer-on', 'alternate-picking']",
          },
          style_tags: {
            type: "array",
            items: { type: "string" },
            description: "e.g. ['blues', 'fingerstyle']",
          },
          chord_progression: {
            type: "array",
            items: { type: "string" },
            description: "Ordered chords, e.g. ['Am', 'F', 'C', 'G']",
          },
          notes: {
            type: "string",
            description: "Teacher/coach notes — what to watch for, what improved, what to drill next",
          },
        },
      },
    },
    {
      name: "music_recall",
      description:
        "NEW (Music Memory): Search stored musical content with musical filters. Returns AI-synthesized answers with citations. Filter by instrument, techniques, or style — e.g. 'show me every take with barre chord issues' or 'what did we practice in E minor last month'.",
      inputSchema: {
        type: "object",
        required: ["q"],
        properties: {
          q: {
            type: "string",
            description: "Natural language query about stored music/practice content",
          },
          instrument: { type: "string", description: "Filter: instrument, e.g. guitar" },
          technique_tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter: techniques, e.g. ['bend', 'travis-picking']",
          },
          style_tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter: styles, e.g. ['blues']",
          },
        },
      },
    },
    {
      name: "note",
      description:
        "Store a lightweight agent observation as a searchable vector. Use when the agent wants to save a quick preference, decision, or observation without needing full document processing. Faster than remember for short notes.",
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            description: "The observation or note to store (minimum 5 characters)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for filtering (e.g. ['preference', 'user-123'])",
          },
        },
      },
    },
    {
      name: "audio_ingest",
      description:
        "NEW (Audio Intelligence): Ingest audio (calls, voice notes, podcasts, music) and extract semantic memory using the audio-intelligence layer. Requires BLUECOLUMN_API_URL to point at the BlueColumn API.",
      inputSchema: {
        type: "object",
        required: ["audio_url", "source_type", "customer_id"],
        properties: {
          audio_url: { type: "string", description: "URL of the audio file" },
          source_type: {
            type: "string",
            enum: ["call", "voice_note", "podcast", "meeting", "music", "environmental"],
          },
          customer_id: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
    {
      name: "call_prepare",
      description:
        "NEW (Audio Intelligence): Get memory context before a voice call starts.",
      inputSchema: {
        type: "object",
        required: ["customer_id"],
        properties: {
          customer_id: { type: "string" },
          include: {
            type: "array",
            items: {
              enum: ["memories", "relationship_summary", "unresolved_items", "suggested_opening", "preferred_delivery"],
            },
          },
        },
      },
    },
    {
      name: "call_complete",
      description:
        "NEW (Audio Intelligence): Store what changed after a call ends.",
      inputSchema: {
        type: "object",
        required: ["call_id", "customer_id"],
        properties: {
          call_id: { type: "string" },
          customer_id: { type: "string" },
          new_memories: { type: "array" },
          sentiment_improved: { type: "boolean" },
          follow_up_required: { type: "boolean" },
        },
      },
    },
    {
      name: "audio_recall",
      description:
        "NEW (Audio Intelligence): Search audio memories and get audio-backed citations.",
      inputSchema: {
        type: "object",
        required: ["customer_id"],
        properties: {
          customer_id: { type: "string" },
          query: { type: "string" },
          filter_type: {
            type: "string",
            enum: ["preference", "promise", "fact", "action_item", "all"],
          },
          top_k: { type: "number", default: 5 },
        },
      },
    },
    {
      name: "sound_analyze",
      description:
        "NEW (Audio Intelligence): Detect and index non-speech audio events.",
      inputSchema: {
        type: "object",
        required: ["audio_id"],
        properties: {
          audio_id: { type: "string" },
          detect_events: { type: "boolean" },
          search_for: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "music_analyze",
      description:
        "NEW (Audio Intelligence): Extract tempo, structure, instrumentation, mood from music.",
      inputSchema: {
        type: "object",
        required: ["audio_id"],
        properties: {
          audio_id: { type: "string" },
          extract: {
            type: "array",
            items: {
              enum: ["structure", "tempo", "instruments", "energy_curve", "vocal_characteristics", "motifs"],
            },
          },
        },
      },
    },
    {
      name: "streaming_audio_ingest",
      description:
        "Ingest an edge-device audio chunk (car, doorbell, wearable) into per-device streaming memory. Whisper large-v3 transcription, entity + intent extraction, idempotent retries.",
      inputSchema: {
        type: "object",
        properties: {
          device_id: { type: "string", description: "Stable device identifier (e.g. 'dashcam-01')" },
          audio_base64: { type: "string", description: "Base64-encoded audio chunk (max ~25MB decoded)" },
          format: { type: "string", enum: ["wav", "opus", "pcm", "mp3"], description: "Audio format (default wav)" },
          sample_rate: { type: "number", description: "Sample rate in Hz (default 16000)" },
          duration_seconds: { type: "number", description: "Chunk duration in seconds if known" },
          idempotency_key: { type: "string", description: "chunk_<deviceId>_<timestamp>_<hash>; auto-generated when omitted" },
        },
        required: ["device_id", "audio_base64"],
      },
    },
    {
      name: "streaming_audio_recall",
      description:
        "Recall over streamed device-audio memory for a specific device. Returns transcribed segments and session summaries ranked by relevance.",
      inputSchema: {
        type: "object",
        properties: {
          device_id: { type: "string", description: "Device identifier used during ingest" },
          query: { type: "string", description: "Natural-language query over that device's audio history" },
        },
        required: ["device_id", "query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "namespace") {
      return {
        content: [{ type: "text", text: JSON.stringify({ namespace: NAMESPACE }, null, 2) }],
      };
    }

    if (name === "remember") {
      const { text, audio_url, file_url, title } = args as {
        text?: string;
        audio_url?: string;
        file_url?: string;
        title?: string;
      };

      if (!text && !audio_url && !file_url) {
        throw new Error("Provide text, audio_url, or file_url");
      }

      const body: Record<string, unknown> = {};
      if (text) body.text = text;
      if (audio_url) body.audio_url = audio_url;
      if (file_url) body.file_url = file_url;
      if (title) body.title = title;

      const result = await callBlueColumn("agent-remember", body);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stored: true,
              session_id: result.session_id,
              title: result.title,
              summary: result.summary,
              action_items: result.action_items,
              key_topics: result.key_topics,
              chunk_count: result.chunk_count,
            }, null, 2),
          },
        ],
      };
    }

    if (name === "recall") {
      const { q } = args as { q: string };
      const result = await callBlueColumn("agent-recall", { q });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              answer: result.answer,
              sources: result.sources,
              tokens_used: result.tokens_used,
            }, null, 2),
          },
        ],
      };
    }

    if (name === "music_remember") {
      const a = args as {
        audio_url?: string;
        text?: string;
        title?: string;
        instrument?: string;
        musical_key?: string;
        tempo_bpm?: number;
        technique_tags?: string[];
        style_tags?: string[];
        chord_progression?: string[];
        notes?: string;
      };
      if (!a.audio_url && !a.text) {
        throw new Error("Provide audio_url (a recording) or text (notation/lesson summary)");
      }
      const context = composeMusicContext(a);
      const body: Record<string, unknown> = {};
      if (a.audio_url) body.audio_url = a.audio_url;
      // Merge structured context into the text payload so it is embedded and recallable.
      const merged = [context, a.text].filter(Boolean).join("\n\n");
      if (merged) body.text = merged;
      if (a.title) body.title = a.title;

      const result = await callBlueColumn("agent-remember", body);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stored: true,
              session_id: result.session_id,
              title: result.title,
              summary: result.summary,
              action_items: result.action_items,
              key_topics: result.key_topics,
              chunk_count: result.chunk_count,
              music_context_captured: Boolean(context),
            }, null, 2),
          },
        ],
      };
    }

    if (name === "music_recall") {
      const a = args as {
        q: string;
        instrument?: string;
        technique_tags?: string[];
        style_tags?: string[];
      };
      if (!a.q) throw new Error("Provide q");
      // Semantic filter hints — appended to the query so recall scopes to music.
      const hints: string[] = [];
      if (a.instrument) hints.push(`instrument: ${a.instrument}`);
      if (a.technique_tags?.length) hints.push(`techniques: ${a.technique_tags.join(", ")}`);
      if (a.style_tags?.length) hints.push(`styles: ${a.style_tags.join(", ")}`);
      const q = hints.length ? `${a.q} (${hints.join("; ")})` : a.q;

      const result = await callBlueColumn("agent-recall", { q });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              answer: result.answer,
              sources: result.sources,
              tokens_used: result.tokens_used,
            }, null, 2),
          },
        ],
      };
    }

    if (name === "note") {
      const { text, tags } = args as { text: string; tags?: string[] };
      const body: Record<string, unknown> = { text };
      if (tags) body.tags = tags;

      const result = await callBlueColumn("agent-note", body);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stored: true,
              note_id: result.note_id,
              chunk_count: result.chunk_count,
              queryable: result.queryable,
            }, null, 2),
          },
        ],
      };
    }

    if (name === "audio_ingest") {
      const { audio_url, source_type, customer_id, metadata } = args as {
        audio_url: string;
        source_type?: string;
        customer_id?: string;
        metadata?: Record<string, unknown>;
      };
      if (!audio_url) throw new Error("Provide audio_url");
      const result = await callAudioApi("/v1/audio/ingest", {
        audio_url,
        source_type: source_type || "voice_note",
        customer_id,
        metadata,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "call_prepare") {
      const { customer_id, include } = args as { customer_id: string; include?: string[] };
      if (!customer_id) throw new Error("Provide customer_id");
      const result = await callAudioApi("/v1/calls/prepare", { customer_id, include });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "call_complete") {
      const { call_id, customer_id, new_memories, sentiment_improved, follow_up_required } = args as {
        call_id: string;
        customer_id: string;
        new_memories?: unknown[];
        sentiment_improved?: boolean;
        follow_up_required?: boolean;
      };
      if (!call_id || !customer_id) throw new Error("Provide call_id and customer_id");
      const result = await callAudioApi("/v1/calls/complete", {
        call_id,
        customer_id,
        new_memories,
        sentiment_improved,
        follow_up_required,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "audio_recall") {
      const { customer_id, query, top_k } = args as {
        customer_id: string;
        query?: string;
        top_k?: number;
      };
      if (!customer_id) throw new Error("Provide customer_id");
      const result = await callAudioApi("/v1/memories/recall", {
        query: query || "",
        limit: top_k || 5,
        namespace: NAMESPACE,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "sound_analyze") {
      const { audio_id, detect_events, search_for } = args as {
        audio_id: string;
        detect_events?: boolean;
        search_for?: string[];
      };
      if (!audio_id) throw new Error("Provide audio_id");
      const result = await callAudioApi("/v1/sound/analyze", {
        audio_id,
        detect_events,
        search_for,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "music_analyze") {
      const { audio_id, extract } = args as { audio_id: string; extract?: string[] };
      if (!audio_id) throw new Error("Provide audio_id");
      const result = await callAudioApi("/v1/music/analyze", { audio_id, extract });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "streaming_audio_ingest") {
      const { device_id, audio_base64, format, sample_rate, duration_seconds, idempotency_key } = args as {
        device_id: string;
        audio_base64: string;
        format?: string;
        sample_rate?: number;
        duration_seconds?: number;
        idempotency_key?: string;
      };
      if (!device_id || !audio_base64) throw new Error("Provide device_id and audio_base64");
      const ts = Date.now();
      const hash = createHash("sha256")
        .update(audio_base64.slice(0, 2048))
        .digest("hex")
        .slice(0, 12);
      const result = await callStreamingApi("/streaming-audio", {
        deviceId: device_id,
        timestamp: ts,
        audio: audio_base64,
        format: format || "wav",
        sampleRate: sample_rate,
        durationSeconds: duration_seconds,
        idempotencyKey: idempotency_key || `chunk_${device_id}_${ts}_${hash}`,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "streaming_audio_recall") {
      const { device_id, query } = args as { device_id: string; query: string };
      if (!device_id || !query) throw new Error("Provide device_id and query");
      const result = await callStreamingApi("/streaming-audio/query", {
        deviceId: device_id,
        query,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BlueColumn MCP server running. Get your API key at https://bluecolumn.ai");
}

main().catch(console.error);
