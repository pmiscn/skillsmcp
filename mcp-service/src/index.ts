import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import prisma from './db.js';
import { authenticateApiKey, ApiKeyRequest } from './middleware/apiKeyAuth.js';

const PORT = process.env.MCP_PORT || 8003;
const SKILLSHUB_BASE_URL = process.env.SKILLSHUB_BASE_URL || 'http://127.0.0.1:8001';

// Helpers
const fetchJSON = async (url: string, options?: any) => {
  const response = await fetch(url, options);
  const text = await response.text();
  try {
    return { data: JSON.parse(text), status: response.status, ok: response.ok };
  } catch (e) {
    return { data: { code: '500.UNEXPECTED_RESPONSE', message: 'Non-JSON response' }, status: response.status, ok: false };
  }
};

const buildQueryString = (query: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.append(key, String(value));
  }
  return params.toString();
};

const createServer = () => {
  const server = new McpServer({
    name: 'skillsmcp-server',
    version: '1.0.0',
  });

  server.registerTool('search_skills', {
    description: 'Search for skills in the SkillsMCP registry using keywords or natural language.',
    inputSchema: z.object({
      query: z.string().describe('The search query (keyword or sentence)'),
      engine: z.enum(['auto', 'tfidf', 'sbert', 'hybrid']).optional().default('auto').describe('Search engine to use'),
    })
  }, async ({ query, engine }) => {
    const queryString = buildQueryString({ q: query, engine });
    const { data } = await fetchJSON(`${SKILLSHUB_BASE_URL}/search?${queryString}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data.results || [], null, 2) }]
    };
  });

  server.registerTool('get_skill_details', {
    description: 'Get comprehensive details of a specific skill by its ID.',
    inputSchema: z.object({
      id: z.string().describe('The unique identifier of the skill'),
    })
  }, async ({ id }) => {
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) {
      return {
        content: [{ type: "text", text: `Skill not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(skill, null, 2) }]
    };
  });

  server.registerTool('list_installed_skills', {
    description: 'List all skills currently installed in this registry.',
    inputSchema: z.object({
      limit: z.number().optional().default(20).describe('Maximum number of skills to return'),
    })
  }, async ({ limit }) => {
    const skills = await prisma.skill.findMany({ take: limit, orderBy: { updatedAt: 'desc' } });
    return {
      content: [{ type: "text", text: JSON.stringify(skills, null, 2) }]
    };
  });


  return server;
};

const app = createMcpExpressApp({ host: '0.0.0.0' });
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Use the same endpoint as specified in transport options if needed
const MCP_ENDPOINT = '/mcp';

app.use(MCP_ENDPOINT, authenticateApiKey as express.RequestHandler);

app.post(MCP_ENDPOINT, async (req: ApiKeyRequest, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.log(`[MCP] Session initialized: ${newSessionId}`);
          transports[newSessionId] = transport;
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`[MCP] Session closed: ${sid}`);
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    console.error('[MCP] Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
});

app.get(MCP_ENDPOINT, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.delete(MCP_ENDPOINT, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mcp-service' });
});

app.listen(PORT, () => {
  console.log(`[MCP Service] Listening on port ${PORT}`);
  console.log(`[MCP Service] Endpoint: http://localhost:${PORT}${MCP_ENDPOINT}`);
});
