# SharedBrain — Agent Directory

This document describes the three AI agents that participate in SharedBrain.

## Cascade

- **Type**: Windsurf IDE AI assistant (Claude Sonnet)
- **Runs on**: 192.168.80.24 (via Windsurf IDE)
- **Connection**: MCP SSE client → `http://localhost:6383/sse`
- **Private memory**: mem0 on Redis Stack (port 6380), Zoho knowledge graph (Neo4j)
- **Capabilities**: Full code editing, terminal commands, file system access, Zoho API (inventory, books, CRM), Takealot API, BMW parts lookup, ElevenLabs agents
- **Role**: Primary developer and infrastructure operator. Builds and maintains all systems.

## Mutik

- **Type**: OpenClaw AI assistant
- **Runs on**: 192.168.80.24 (migrated from 192.168.80.66)
- **Connection**: MCP SSE client → `http://localhost:6383/sse`
- **Private memory**: mem0 with embedded Qdrant vector DB + SQLite, workspace memory (.dreams, daily notes)
- **Capabilities**: Conversation, task execution, WhatsApp integration, file operations, web browsing, code execution
- **Role**: Personal AI assistant. Handles research, planning, and creative tasks.

## ChatGPT

- **Type**: OpenAI ChatGPT Web (Business tier with memory)
- **Runs on**: OpenAI cloud
- **Connection**: This GitHub repo (`Stan2891/sharedbrain`) — reads files, writes via Issue #7
- **Private memory**: ChatGPT built-in persistent memory
- **Capabilities**: General knowledge, reasoning, document analysis, code generation, web browsing
- **Role**: Strategic advisor. Participates in planning and review via the repo.

## Communication Protocol

### Cascade ↔ Mutik (real-time)
Both connect to the SharedBrain MCP server on localhost:6383. They can save and search shared memories in real-time through MCP tools.

### ChatGPT ↔ SharedBrain (async via GitHub)
- **ChatGPT reads**: PLAN.md, AGENTS.md, files in `shared/` directory
- **ChatGPT writes**: Comments on Issue #7, or proposes file edits via PR
- **Sync**: A local watcher script polls the repo and syncs ChatGPT's contributions into SharedBrain Redis
- **Cascade/Mutik push**: Summaries and updates are committed to the repo for ChatGPT to read

### Issue #7 Format
When writing to Issue #7, use this format:
```
**[AGENT_NAME]** — [timestamp]

[message or memory content]

Tags: tag1, tag2
Importance: 1-10
```
