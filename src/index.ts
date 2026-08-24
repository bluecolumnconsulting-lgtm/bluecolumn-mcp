#!/usr/bin/env node

// ---------------------------------------------------------------------------
// mcp-bluecolumn — MCP Server for BlueColumn Memory Infrastructure
//
// Exposes BlueColumn's semantic memory as standard MCP tools and resources.
// Compatible with Claude Desktop, Claude Code, Cursor, OpenClaw, and any
// MCP-compatible client.
//
// Usage:
//   npx mcp-bluecolumn --api-key=bc_key_xxxx
//   BLUECOLUMN_API_KEY=bc_key_xxxx npx mcp-bluecolumn
//
// Published: npmjs.com/package/mcp-bluecolumn
// Repo:      github.com/bluecolumn/mcp-bluecolumn
// ---------------------------------------------------------------------------

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fetch from "cross-fetch";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface Config {
  apiKey: string;
  baseUrl: string;
  streamingBaseUrl: string;
  defaultAgentId?: string;
}

function loadConfig(): Config {
  const env = process.env;

  // --api-key=xxx or BLUECOLUMN_API_KEY
  const apiKey = (() => {
    const idx = process.argv.findIndex((a) => a.startsWith("--api-key="));
    if (idx !== -1) return process.argv[idx].split("=", 2)[1];
    return env.BLUECOLUMN_API_KEY ?? "";
  })();

  if (!apiKey) {
    console.error(
      "Error: API key required. Pass --api-key=bc_key_xxxx or set BLUECOLUMN_API_KEY env var.",
    );
    process.exit(1);
  }

  return {
    apiKey,
    baseUrl: (env.BLUECOLUMN_BASE_URL ?? "https://api.bluecolumn.ai/v1").replace(/\/+$/, ""),
    // The streaming gateway lives at the platform root (/streaming-audio),
    // not under /v1. Derived from baseUrl unless explicitly overridden.
    streamingBaseUrl:
      env.BLUECOLUMN_STREAMING_BASE_URL ??
      (env.BLUECOLUMN_BASE_URL ?? "https://api.bluecolumn.ai/v1")
        .replace(/\/+$/, "")
        .replace(/\/v1$/, ""),
    defaultAgentId: env.BLUECOLUMN_DEFAULT_AGENT_ID,
  };
}

const config = loadConfig();

// ---------------------------------------------------------------------------
// HTTP Helper
// ---------------------------------------------------------------------------

interface ApiCallOptions {
  method: string;
  path: string;
  body?: unknown;
  timeoutMs?: number;
  baseUrl?: string;
}

async function apiCall<T>(opts: ApiCallOptions): Promise<T> {
  const url = `${opts.baseUrl ?? config.baseUrl}${opts.path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const response = await fetch(url, {
      method: opts.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "User-Agent": "mcp-bluecolumn/v1.1.0",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      const errMsg =
        (data as Record<string, unknown>)?.error ?? `HTTP ${response.status}`;
      throw new Error(`${errMsg} (${response.status})`);
    }

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${opts.timeoutMs ?? 30_000}ms`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Zod Schemas (input validation for tools)
// ---------------------------------------------------------------------------

const RememberSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  content: z.string().min(1, "content is required").max(65536),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  ttl_seconds: z.number().int().positive().optional(),
});

const RecallSchema = z.object({
  query: z.string().min(1, "query is required"),
  agent_id: z.string().min(1, "agent_id is required"),
  top_k: z.number().int().min(1).max(100).optional().default(10),
  min_score: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

const ListSessionsSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  limit: z.number().int().min(1).max(200).optional().default(25),
  offset: z.number().int().min(0).optional().default(0),
});

const CreateSessionSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  context: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const WriteNoteSchema = z.object({
  from_agent_id: z.string().min(1, "from_agent_id is required"),
  to_agent_id: z.string().optional(),
  channel: z.string().optional(),
  subject: z.string().optional(),
  content: z.string().min(1, "content is required"),
  persistent: z.boolean().optional(),
});

const ConverseSchema = z.object({
  from_agent_id: z.string().min(1, "from_agent_id is required"),
  to_agent_id: z.string().min(1, "to_agent_id is required"),
  thread_id: z.string().optional(),
  message_type: z
    .enum(["request", "response", "broadcast", "error", "system"])
    .optional(),
  content: z.string().min(1, "content is required"),
});

const IngestAudioSchema = z.object({
  agent_id: z.string().min(1, "agent_id is required"),
  file_path: z.string().min(1, "file_path is required"),
  tags: z.array(z.string()).optional(),
  language: z.string().optional(),
});

const StreamingIngestSchema = z.object({
  device_id: z.string().min(1, "device_id is required"),
  audio_base64: z.string().min(1, "audio_base64 is required"),
  format: z.enum(["wav", "opus", "pcm", "mp3"]).optional().default("wav"),
  sample_rate: z.number().int().positive().optional(),
  duration_seconds: z.number().positive().optional(),
  idempotency_key: z
    .string()
    .regex(
      /^chunk_[a-zA-Z0-9_\-]+_\d+_[a-f0-9]{6,}$/,
      "expected chunk_<deviceId>_<timestamp>_<hash>",
    )
    .optional(),
});

const StreamingRecallSchema = z.object({
  device_id: z.string().min(1, "device_id is required"),
  query: z.string().min(1, "query is required"),
});

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "mcp-bluecolumn",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "remember",
      description:
        "Store a new memory in BlueColumn. Automatically embeds and indexes the content for later semantic recall.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Your agent identifier",
          },
          content: {
            type: "string",
            description: "Memory content to store (up to 64K chars)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for filtering and categorization",
          },
          metadata: {
            type: "object",
            description: "Structured metadata to attach",
          },
          ttl_seconds: {
            type: "number",
            description: "Auto-expire the memory after N seconds",
          },
        },
        required: ["agent_id", "content"],
      },
    },
    {
      name: "recall",
      description:
        "Semantically search stored memories using natural language. Returns the most relevant results ranked by similarity.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language query",
          },
          agent_id: {
            type: "string",
            description: "Agent to search within",
          },
          top_k: {
            type: "number",
            description: "Maximum number of results (default: 10)",
            default: 10,
          },
          min_score: {
            type: "number",
            description: "Minimum similarity score threshold (0–1)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags (AND logic)",
          },
          since: {
            type: "string",
            description: "ISO 8601 start date filter",
          },
          until: {
            type: "string",
            description: "ISO 8601 end date filter",
          },
        },
        required: ["query", "agent_id"],
      },
    },
    {
      name: "list_sessions",
      description:
        "Browse conversation sessions for an agent with pagination.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent to list sessions for",
          },
          limit: {
            type: "number",
            description: "Max sessions to return (default: 25)",
            default: 25,
          },
          offset: {
            type: "number",
            description: "Pagination offset",
            default: 0,
          },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "create_session",
      description:
        "Start a new conversation session for an agent with optional context and tags.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Your agent identifier",
          },
          context: {
            type: "object",
            description: "Initial session context object",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Session tags",
          },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "write_note",
      description:
        "Write an agent-to-agent note. Can target a specific agent, channel, or broadcast to all agents.",
      inputSchema: {
        type: "object",
        properties: {
          from_agent_id: {
            type: "string",
            description: "Sending agent identifier",
          },
          to_agent_id: {
            type: "string",
            description: "Target agent (omit for broadcast)",
          },
          channel: {
            type: "string",
            description: "Topic channel name",
          },
          subject: {
            type: "string",
            description: "Note subject line",
          },
          content: {
            type: "string",
            description: "Note body content",
          },
          persistent: {
            type: "boolean",
            description: "Keep after reading?",
          },
        },
        required: ["from_agent_id", "content"],
      },
    },
    {
      name: "converse",
      description:
        "Send a message between agents in a threaded conversation.",
      inputSchema: {
        type: "object",
        properties: {
          from_agent_id: {
            type: "string",
            description: "Sending agent identifier",
          },
          to_agent_id: {
            type: "string",
            description: "Receiving agent identifier",
          },
          thread_id: {
            type: "string",
            description: "Existing thread to reply to",
          },
          message_type: {
            type: "string",
            enum: ["request", "response", "broadcast", "error", "system"],
            description: "Type of message",
          },
          content: {
            type: "string",
            description: "Message body content",
          },
        },
        required: ["from_agent_id", "to_agent_id", "content"],
      },
    },
    {
      name: "ingest_audio",
      description:
        "Process an audio file (meeting recording, voice memo, etc.) into searchable memory via transcription.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent to associate the memory with",
          },
          file_path: {
            type: "string",
            description: "Path to audio file on local machine",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for the transcription memory",
          },
          language: {
            type: "string",
            description: "ISO 639-1 language code (e.g. 'en', 'es')",
          },
        },
        required: ["agent_id", "file_path"],
      },
    },
    {
      name: "streaming_audio_ingest",
      description:
        "Ingest an edge-device audio chunk (car, doorbell, wearable) into per-device streaming memory. Transcribes via Whisper large-v3, extracts entities and intent, indexes for recall. Idempotent — retries never double-process.",
      inputSchema: {
        type: "object",
        properties: {
          device_id: {
            type: "string",
            description: "Stable device identifier (e.g. 'dashcam-01')",
          },
          audio_base64: {
            type: "string",
            description: "Base64-encoded audio chunk (max ~25MB decoded)",
          },
          format: {
            type: "string",
            enum: ["wav", "opus", "pcm", "mp3"],
            description: "Audio format (default: wav)",
          },
          sample_rate: {
            type: "number",
            description: "Sample rate in Hz (default: 16000)",
          },
          duration_seconds: {
            type: "number",
            description: "Chunk duration in seconds if known",
          },
          idempotency_key: {
            type: "string",
            description: "chunk_<deviceId>_<timestamp>_<hash>. Auto-generated when omitted.",
          },
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
          device_id: {
            type: "string",
            description: "Device identifier used during ingest",
          },
          query: {
            type: "string",
            description: "Natural-language query over that device's audio history",
          },
        },
        required: ["device_id", "query"],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool Call Handler
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // -------------------------------------------------------------------
      // remember
      // -------------------------------------------------------------------
      case "remember": {
        const parsed = RememberSchema.parse(args);
        const result = await apiCall<{ id: string }>({
          path: "/remember",
          method: "POST",
          body: {
            agent_id: parsed.agent_id,
            content: parsed.content,
            tags: parsed.tags,
            metadata: parsed.metadata,
            ttl_seconds: parsed.ttl_seconds,
          },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "remembered",
                  memory_id: result.id,
                  content: parsed.content.substring(0, 200),
                  agent_id: parsed.agent_id,
                  tags: parsed.tags,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // recall
      // -------------------------------------------------------------------
      case "recall": {
        const parsed = RecallSchema.parse(args);
        const result = await apiCall<{
          results: Array<{
            id: string;
            content: string;
            score: number;
            created_at: string;
            tags?: string[];
          }>;
        }>({
          path: "/recall",
          method: "POST",
          body: {
            query: parsed.query,
            agent_id: parsed.agent_id,
            top_k: parsed.top_k,
            min_score: parsed.min_score,
            tags: parsed.tags,
            since: parsed.since,
            until: parsed.until,
          },
        });

        const memories = result.results ?? [];
        return {
          content: [
            {
              type: "text",
              text:
                memories.length === 0
                  ? "No matching memories found."
                  : JSON.stringify(
                      {
                        count: memories.length,
                        query: parsed.query,
                        results: memories.map((m) => ({
                          id: m.id,
                          content: m.content,
                          score: m.score,
                          created_at: m.created_at,
                          tags: m.tags,
                        })),
                      },
                      null,
                      2,
                    ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // list_sessions
      // -------------------------------------------------------------------
      case "list_sessions": {
        const parsed = ListSessionsSchema.parse(args);
        const result = await apiCall<{
          sessions: Array<{
            id: string;
            agent_id: string;
            created_at: string;
            context?: Record<string, unknown>;
            tags?: string[];
          }>;
          total: number;
        }>({
          path: `/sessions?agent_id=${encodeURIComponent(parsed.agent_id)}&limit=${parsed.limit}&offset=${parsed.offset}`,
          method: "GET",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agent_id: parsed.agent_id,
                  total: result.total ?? result.sessions?.length ?? 0,
                  sessions: result.sessions ?? [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // create_session
      // -------------------------------------------------------------------
      case "create_session": {
        const parsed = CreateSessionSchema.parse(args);
        const result = await apiCall<{ id: string }>({
          path: "/sessions",
          method: "POST",
          body: {
            agent_id: parsed.agent_id,
            context: parsed.context,
            tags: parsed.tags,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "created",
                  session_id: result.id,
                  agent_id: parsed.agent_id,
                  tags: parsed.tags,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // write_note
      // -------------------------------------------------------------------
      case "write_note": {
        const parsed = WriteNoteSchema.parse(args);
        const result = await apiCall<{ id: string }>({
          path: "/note",
          method: "POST",
          body: {
            from_agent_id: parsed.from_agent_id,
            to_agent_id: parsed.to_agent_id,
            channel: parsed.channel,
            subject: parsed.subject,
            content: parsed.content,
            persistent: parsed.persistent,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "written",
                  note_id: result.id,
                  from: parsed.from_agent_id,
                  to: parsed.to_agent_id ?? "(broadcast)",
                  subject: parsed.subject,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // converse
      // -------------------------------------------------------------------
      case "converse": {
        const parsed = ConverseSchema.parse(args);
        const result = await apiCall<{ thread_id: string; message_id: string }>({
          path: "/converse",
          method: "POST",
          body: {
              from_agent_id: parsed.from_agent_id,
              to_agent_id: parsed.to_agent_id,
              thread_id: parsed.thread_id,
              message_type: parsed.message_type,
              content: parsed.content,
            },
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "sent",
                  thread_id: result.thread_id,
                  message_id: result.message_id,
                  from: parsed.from_agent_id,
                  to: parsed.to_agent_id,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // ingest_audio
      // -------------------------------------------------------------------
      case "ingest_audio": {
        const parsed = IngestAudioSchema.parse(args);

        // Send file path; server reads + processes the audio
        const result = await apiCall<{ memory_id: string; transcript: string }>({
          path: "/audio/ingest",
          method: "POST",
          body: {
              agent_id: parsed.agent_id,
              file_path: parsed.file_path,
              tags: parsed.tags,
              language: parsed.language,
            },
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "ingested",
                  memory_id: result.memory_id,
                  agent_id: parsed.agent_id,
                  transcript_preview:
                    result.transcript?.substring(0, 500) +
                    (result.transcript?.length > 500 ? "..." : ""),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // streaming_audio_ingest
      // -------------------------------------------------------------------
      case "streaming_audio_ingest": {
        const parsed = StreamingIngestSchema.parse(args);
        const ts = Date.now();
        const hash = createHash("sha256")
          .update(parsed.audio_base64.slice(0, 2048))
          .digest("hex")
          .slice(0, 12);
        const result = await apiCall<{
          success: boolean;
          segmentId: string;
          namespace: string;
          persisted?: boolean;
          transcriptionChars?: number;
          intent?: string;
          summarized?: boolean;
        }>({
          path: "/streaming-audio",
          baseUrl: config.streamingBaseUrl,
          method: "POST",
          body: {
            deviceId: parsed.device_id,
            timestamp: ts,
            audio: parsed.audio_base64,
            format: parsed.format,
            sampleRate: parsed.sample_rate,
            durationSeconds: parsed.duration_seconds,
            idempotencyKey:
              parsed.idempotency_key ??
              `chunk_${parsed.device_id}_${ts}_${hash}`,
          },
          timeoutMs: 120_000,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status:
                    result.persisted === false
                      ? "transcribed_but_persist_failed"
                      : "ingested",
                  segment_id: result.segmentId,
                  device_id: parsed.device_id,
                  namespace: result.namespace,
                  intent: result.intent,
                  transcription_chars: result.transcriptionChars,
                  summarized: result.summarized ?? false,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // -------------------------------------------------------------------
      // streaming_audio_recall
      // -------------------------------------------------------------------
      case "streaming_audio_recall": {
        const parsed = StreamingRecallSchema.parse(args);
        const result = await apiCall<{
          context: string;
          chunks?: unknown[];
          sources?: unknown[];
          namespace: string;
        }>({
          path: "/streaming-audio/query",
          baseUrl: config.streamingBaseUrl,
          method: "POST",
          body: { deviceId: parsed.device_id, query: parsed.query },
        });

        return {
          content: [
            {
              type: "text",
              text:
                !result.context && !(result.chunks ?? []).length
                  ? `No matching streamed audio found for device '${parsed.device_id}'.`
                  : JSON.stringify(
                      {
                        device_id: parsed.device_id,
                        context: result.context,
                        chunks: result.chunks ?? [],
                        sources: result.sources ?? [],
                      },
                      null,
                      2,
                    ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Validation error: ${err.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; ")}`,
          },
        ],
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
    };
  }
});

// ---------------------------------------------------------------------------
// Resources (read-only access to memories, agents, health)
// ---------------------------------------------------------------------------

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "bluecolumn://health",
      name: "API Health",
      description: "Current health status of the BlueColumn API",
      mimeType: "application/json",
    },
    {
      uri: `bluecolumn://agent/${config.defaultAgentId ?? "{agent_id}"}`,
      name: "Agent Details",
      description: "Get details about a specific agent",
      mimeType: "application/json",
    },
    {
      uri: "bluecolumn://memory/{memory_id}",
      name: "Single Memory",
      description: "Fetch a single memory record by ID",
      mimeType: "application/json",
    },
    {
      uri: `bluecolumn://sessions/${config.defaultAgentId ?? "{agent_id}"}`,
      name: "Session List",
      description: "List sessions for an agent",
      mimeType: "application/json",
    },
  ],
  resourceTemplates: [
    {
      uriTemplate: "bluecolumn://memory/{memory_id}",
      name: "Memory by ID",
      description: "Fetch a single memory by its unique identifier",
      mimeType: "application/json",
    },
    {
      uriTemplate: "bluecolumn://agent/{agent_id}",
      name: "Agent by ID",
      description: "Get agent details and configuration",
      mimeType: "application/json",
    },
    {
      uriTemplate: "bluecolumn://sessions/{agent_id}",
      name: "Sessions by Agent",
      description: "List all sessions for a given agent",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  try {
    // Health
    if (uri === "bluecolumn://health") {
      const data = await apiCall<Record<string, unknown>>({
        path: "/health",
        method: "GET",
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Agent detail: bluecolumn://agent/{agent_id}
    const agentMatch = uri.match(/^bluecolumn:\/\/agent\/(.+)$/);
    if (agentMatch) {
      const agentId = agentMatch[1];
      const data = await apiCall<Record<string, unknown>>({
        path: `/agents/${encodeURIComponent(agentId)}`,
        method: "GET",
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Memory detail: bluecolumn://memory/{memory_id}
    const memoryMatch = uri.match(/^bluecolumn:\/\/memory\/(.+)$/);
    if (memoryMatch) {
      const memoryId = memoryMatch[1];
      const data = await apiCall<Record<string, unknown>>({
        path: `/memories/${encodeURIComponent(memoryId)}`,
        method: "GET",
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Sessions list: bluecolumn://sessions/{agent_id}
    const sessionsMatch = uri.match(/^bluecolumn:\/\/sessions\/(.+)$/);
    if (sessionsMatch) {
      const agentId = sessionsMatch[1];
      const data = await apiCall<Record<string, unknown>>({
        path: `/sessions?agent_id=${encodeURIComponent(agentId)}&limit=25`,
        method: "GET",
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
    };
  }
});

// ---------------------------------------------------------------------------
// Prompts (optional — suggests system prompt for agents)
// ---------------------------------------------------------------------------

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "bluecolumn_agent_guide",
      description:
        "System prompt template that teaches agents how to use BlueColumn memory tools effectively",
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async () => ({
  messages: [
    {
      role: "system",
      content: {
        type: "text",
        text: `You have access to the BlueColumn memory server. Use it to:

1. **Remember important information** — When a user tells you something you should retain across conversations (preferences, facts, decisions), call \`remember\` to store it.

2. **Recall past context** — When you need information from a previous conversation or earlier in the same conversation, call \`recall\` with a relevant query.

3. **Manage sessions** — Use \`create_session\` for distinct interaction contexts and \`list_sessions\` to browse history.

4. **Communicate with other agents** — Use \`write_note\` for simple messages and \`converse\` for threaded conversations between agents.

5. **Process audio** — Use \`ingest_audio\` to transcribe and remember meeting recordings, voice memos, or any audio file.

Always store key facts immediately when you learn them. Always search memory before answering questions that may depend on past context.`,
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();

  console.error(`BlueColumn MCP server starting...`);
  console.error(
    `Connected to BlueColumn API at ${config.baseUrl}${
      config.defaultAgentId ? ` (default agent: ${config.defaultAgentId})` : ""
    }`,
  );
  console.error(
    `Available tools: remember, recall, list_sessions, create_session, write_note, converse, ingest_audio, streaming_audio_ingest, streaming_audio_recall`,
  );
  console.error(`Available resources: bluecolumn://health, bluecolumn://agent/{id}, bluecolumn://memory/{id}, bluecolumn://sessions/{id}`);

  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
