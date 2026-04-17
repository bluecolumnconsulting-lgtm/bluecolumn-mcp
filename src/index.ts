#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = "https://xkjkwqbfvkswwdmbtndo.supabase.co/functions/v1";
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
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BlueColumn API error (${res.status}): ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "bluecolumn-mcp", version: "1.0.0" },
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
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
