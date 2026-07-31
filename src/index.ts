#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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

const server = new Server(
  { name: "bluecolumn-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

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
