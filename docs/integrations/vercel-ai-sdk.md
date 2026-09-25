# BlueColumn Memory + Vercel AI SDK

Give any Vercel AI SDK agent persistent memory in three steps.

## 1. Install

No package needed — the SDK speaks MCP natively and bluecolumn-mcp runs via npx.

## 2. Connect (`app/api/chat/route.ts`)

```ts
import { streamText, experimental_createMCPClient as createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from 'ai/mcp-stdio';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = await createMCPClient({
    transport: new StdioMCPTransport({
      command: 'npx',
      args: ['-y', 'bluecolumn-mcp@latest'],
      env: { BLUECOLUMN_API_KEY: process.env.BLUECOLUMN_API_KEY! },
    }),
  });

  try {
    const tools = await mcpClient.tools(); // remember, recall, note
    const result = streamText({
      model: yourModel,
      system: 'You have persistent memory. Store durable facts with remember; search with recall before answering questions that depend on past context.',
      messages,
      tools,
    });
    return result.toDataStreamResponse();
  } finally {
    await mcpClient.close();
  }
}
```

## 3. Prompt the agent

Add to your system prompt: "Store durable facts immediately with remember. Search with recall before answering questions that depend on past context."

## Notes

- Free tier: 100 writes + 100 reads + 30 audio minutes/mo at https://bluecolumn.ai
- recall returns cited sources — surface them in your UI for verifiable answers.
- For serverless deployments, prefer a long-running host for the MCP stdio process (stdio MCP clients don't fit edge runtimes), or call the memory API directly: POST /remember and POST /recall with a Bearer key. Same memory, two fetch calls, works anywhere.
