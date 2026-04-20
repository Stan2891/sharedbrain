require('dotenv').config();
const express = require('express');
const { createClient } = require('redis');
const { ulid } = require('ulid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 6383;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6381';

// --- Redis client ---
let redis;
async function getRedis() {
  if (redis && redis.isOpen) return redis;
  redis = createClient({ url: REDIS_URL });
  redis.on('error', err => console.error('[REDIS]', err.message));
  await redis.connect();

  // Create RediSearch index if it doesn't exist
  try {
    await redis.ft.info('idx:memories');
  } catch (e) {
    console.log('[REDIS] Creating RediSearch index idx:memories');
    await redis.ft.create('idx:memories', {
      '$.text': { type: 'TEXT', AS: 'text' },
      '$.source': { type: 'TAG', AS: 'source' },
      '$.tags.*': { type: 'TAG', AS: 'tags' },
      '$.importance': { type: 'NUMERIC', AS: 'importance' },
      '$.created_at': { type: 'TEXT', AS: 'created_at' }
    }, { ON: 'JSON', PREFIX: 'mem:' });
  }
  return redis;
}

// --- Auth middleware ---
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (token === AUTH_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// --- MCP SSE transport ---
const sseClients = new Map();

// MCP tool definitions
const TOOLS = [
  {
    name: 'memory_save',
    description: 'Save a memory to the shared brain. All agents (Cascade, Mutik, ChatGPT) can read it.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The memory content' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        source: { type: 'string', description: 'Which agent is saving (cascade, mutik, chatgpt)' },
        importance: { type: 'number', description: 'Importance 1-10 (default 5)', minimum: 1, maximum: 10 }
      },
      required: ['text', 'source']
    }
  },
  {
    name: 'memory_search',
    description: 'Search shared memories by text query. Uses full-text search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        source: { type: 'string', description: 'Filter by agent (cascade, mutik, chatgpt)' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_get',
    description: 'Get a specific memory by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID (e.g. mem_01HX...)' }
      },
      required: ['id']
    }
  },
  {
    name: 'memory_list',
    description: 'List recent shared memories, optionally filtered by agent or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Filter by agent' },
        tag: { type: 'string', description: 'Filter by tag' },
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 }
      }
    }
  },
  {
    name: 'memory_delete',
    description: 'Delete a memory by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'memory_stats',
    description: 'Get statistics about the shared brain — total count, per-agent breakdown.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// --- Tool handlers ---
async function handleTool(name, args) {
  const r = await getRedis();

  if (name === 'memory_save') {
    const id = `mem_${ulid()}`;
    const memory = {
      id,
      text: args.text,
      tags: args.tags || [],
      source: args.source || 'unknown',
      importance: args.importance || 5,
      created_at: new Date().toISOString(),
      updated_at: null
    };
    await r.json.set(`mem:${id}`, '$', memory);
    console.log(`[SAVE] ${id} from ${memory.source}: ${memory.text.substring(0, 80)}`);
    return { success: true, id, message: `Memory saved: ${id}` };
  }

  if (name === 'memory_search') {
    const limit = args.limit || 10;
    let query = args.query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    if (!query) query = '*';

    let ftQuery = query === '*' ? '*' : query.split(/\s+/).map(w => `${w}*`).join(' ');
    if (args.source) ftQuery += ` @source:{${args.source}}`;

    try {
      const results = await r.ft.search('idx:memories', ftQuery, { LIMIT: { from: 0, size: limit } });
      const memories = results.documents.map(d => d.value);
      return { success: true, count: results.total, memories };
    } catch (e) {
      // Fallback: scan keys manually
      const keys = await r.keys('mem:*');
      const all = [];
      for (const key of keys.slice(0, 100)) {
        const mem = await r.json.get(key);
        if (mem && mem.text && mem.text.toLowerCase().includes(args.query.toLowerCase())) {
          if (!args.source || mem.source === args.source) all.push(mem);
        }
      }
      return { success: true, count: all.length, memories: all.slice(0, limit), fallback: true };
    }
  }

  if (name === 'memory_get') {
    const mem = await r.json.get(`mem:${args.id}`);
    if (!mem) return { success: false, error: `Memory ${args.id} not found` };
    return { success: true, memory: mem };
  }

  if (name === 'memory_list') {
    const limit = args.limit || 20;
    let ftQuery = '*';
    if (args.source) ftQuery = `@source:{${args.source}}`;
    if (args.tag) {
      const tagFilter = `@tags:{${args.tag}}`;
      ftQuery = ftQuery === '*' ? tagFilter : `${ftQuery} ${tagFilter}`;
    }

    try {
      const results = await r.ft.search('idx:memories', ftQuery, {
        LIMIT: { from: 0, size: limit },
        SORTBY: { BY: 'created_at', DIRECTION: 'DESC' }
      });
      return { success: true, count: results.total, memories: results.documents.map(d => d.value) };
    } catch (e) {
      const keys = await r.keys('mem:*');
      const all = [];
      for (const key of keys.slice(0, 200)) {
        const mem = await r.json.get(key);
        if (mem) {
          if (args.source && mem.source !== args.source) continue;
          if (args.tag && !(mem.tags || []).includes(args.tag)) continue;
          all.push(mem);
        }
      }
      all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { success: true, count: all.length, memories: all.slice(0, limit), fallback: true };
    }
  }

  if (name === 'memory_delete') {
    const deleted = await r.del(`mem:${args.id}`);
    if (!deleted) return { success: false, error: `Memory ${args.id} not found` };
    console.log(`[DELETE] ${args.id}`);
    return { success: true, message: `Deleted ${args.id}` };
  }

  if (name === 'memory_stats') {
    const keys = await r.keys('mem:*');
    const bySource = {};
    for (const key of keys) {
      const mem = await r.json.get(key, { path: '$.source' });
      const src = (Array.isArray(mem) ? mem[0] : mem) || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    }
    return { success: true, total: keys.length, by_source: bySource };
  }

  return { error: `Unknown tool: ${name}` };
}

// --- MCP SSE endpoint ---
app.get('/sse', authMiddleware, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = ulid();
  const msgEndpoint = `/message?clientId=${clientId}`;
  sseClients.set(clientId, res);

  // Send endpoint event
  res.write(`event: endpoint\ndata: ${msgEndpoint}\n\n`);
  console.log(`[SSE] Client ${clientId} connected`);

  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`[SSE] Client ${clientId} disconnected`);
  });

  // Keepalive
  const keepalive = setInterval(() => {
    if (res.writableEnded) { clearInterval(keepalive); return; }
    res.write(': keepalive\n\n');
  }, 30000);
  req.on('close', () => clearInterval(keepalive));
});

// --- MCP message endpoint ---
app.post('/message', authMiddleware, async (req, res) => {
  const clientId = req.query.clientId;
  const sseRes = sseClients.get(clientId);
  if (!sseRes) {
    return res.status(400).json({ error: 'Unknown client. Connect to /sse first.' });
  }

  const { jsonrpc, id, method, params } = req.body;

  let response;

  if (method === 'initialize') {
    response = {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'sharedbrain', version: '1.0.0' }
      }
    };
  } else if (method === 'notifications/initialized') {
    return res.json({ jsonrpc: '2.0', id });
  } else if (method === 'tools/list') {
    response = { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  } else if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    try {
      const result = await handleTool(toolName, toolArgs);
      response = {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      };
    } catch (e) {
      console.error(`[TOOL ERROR] ${toolName}:`, e.message);
      response = {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] }
      };
    }
  } else {
    response = { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } };
  }

  // Send response via SSE
  sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  res.json({ ok: true });
});

// --- Health endpoint ---
app.get('/health', async (req, res) => {
  try {
    const r = await getRedis();
    await r.ping();
    const keys = await r.keys('mem:*');
    res.json({ status: 'ok', redis: 'connected', memories: keys.length, service: 'sharedbrain-mcp' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// --- Start ---
async function start() {
  await getRedis();
  console.log('[REDIS] Connected to SharedBrain Redis');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SHAREDBRAIN] MCP server on port ${PORT}`);
    console.log(`[SHAREDBRAIN] SSE: http://0.0.0.0:${PORT}/sse`);
    console.log(`[SHAREDBRAIN] Health: http://0.0.0.0:${PORT}/health`);
  });
}

start().catch(err => { console.error('[FATAL]', err); process.exit(1); });
