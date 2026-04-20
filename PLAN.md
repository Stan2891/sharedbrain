# SharedBrain — Implementation Plan

SharedBrain is a multi-agent coordination and governance layer. This plan covers the infrastructure build-out: migrating Mutik, standing up shared Redis + MCP, and connecting all three agents. See [PURPOSE.md](PURPOSE.md) for why, [PROTOCOL.md](PROTOCOL.md) for governance, and [STATE_MODEL.md](STATE_MODEL.md) for state definitions.

## Architecture (after migration)

```
┌─────────────────────────────────────────────────────────────┐
│  This machine (192.168.80.24)                               │
│                                                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Mutik (OpenClaw) │  │ Redis Stack  │  │ SharedBrain   │ │
│  │ ~/.openclaw/     │  │ port 6381    │◄►│ MCP Server    │ │
│  │ gateway + mem0   │  │ (dedicated)  │  │ port 6383     │ │
│  └────────┬─────────┘  └──────────────┘  └──┬─────────┬──┘ │
│           │                                  │         │    │
│           │ (local mem0 Qdrant preserved)    │         │    │
│           │                            local │    local│    │
│  ┌────────┴─────────┐              ┌────────┘         │    │
│  │ Mutik's own      │              ▼                   │    │
│  │ memory (Qdrant)  │  ┌─────────────────────┐        │    │
│  │ (private)        │  │ Cascade (Windsurf)  │        │    │
│  └──────────────────┘  │ MCP client          │        │    │
│                        └─────────────────────┘        │    │
│                                                       │    │
│  Both Mutik + Cascade read/write SharedBrain ─────────┘    │
└─────────────────────────────────────────────────────────────┘

        ┌─────────────────────────┐
        │ ChatGPT (Web Business)  │
        │ Reads/writes via this   │
        │ GitHub repo + Issue #7  │
        └─────────────────────────┘
```

## Agents

| Agent | Type | Connection | Private Memory |
|-------|------|------------|----------------|
| **Cascade** | Windsurf AI (Claude) | MCP SSE (localhost:6383) | mem0 Redis (port 6380) |
| **Mutik** | OpenClaw AI | MCP SSE (localhost:6383) | Qdrant + SQLite (local files) |
| **ChatGPT** | OpenAI Web Business | GitHub repo + Issue #7 | ChatGPT built-in memory |

## Step 1 — Migrate Mutik (preserve full state)

**What lives on 192.168.80.66:**
- `~/.openclaw/` (558MB) — gateway config, agents, sessions, workspace, mem0, credentials, identity
- `~/.mem0/` (40K) — mem0 config + Qdrant migrations
- Running processes: `openclaw-gateway` + `mem0-server.py` (port 9101)
- mem0 uses embedded on-disk Qdrant at `~/.openclaw/workspace/state/mem0-qdrant/`
- **No Docker, no external DBs** — everything is local files

**Migration steps:**
1. Stop Mutik on 192.168.80.66
2. Full rsync `~/.openclaw/` and `~/.mem0/` to this machine
3. Copy the `openclaw-gateway` binary
4. Verify file counts + sizes match
5. Update any hardcoded paths if needed
6. Start Mutik locally, verify sessions + memory intact
7. Create `mutik.service` systemd unit

**Preserved:** sessions, memory (Qdrant + SQLite), identity/keys, WhatsApp credentials, agent config, workspace

## Step 2 — New Redis Stack container (port 6381)

| Port | Service | Purpose |
|------|---------|---------|
| 6379 | redis-server (native) | System/general |
| 6380 | redis-stack (Docker) | Cascade mem0 memory |
| **6381** | **sharedbrain-redis (Docker)** | **SharedBrain (NEW)** |

- Image: `redis/redis-stack-server:latest`
- Bind: `0.0.0.0`, password protected
- Volume: persistent on disk
- Modules: RedisJSON + RediSearch

## Step 3 — SharedBrain MCP server (port 6383)

| Tool | Description |
|------|-------------|
| `memory_save` | Save memory (text, tags, source agent, importance) |
| `memory_search` | Full-text search (RediSearch) |
| `memory_get` | Get by ID |
| `memory_list` | Recent memories, filter by agent/tag |
| `memory_delete` | Remove memory |
| `memory_stats` | Count + per-agent breakdown |

## Step 4 — Connect Cascade + Mutik via MCP

## Step 5 — Connect ChatGPT via this GitHub repo

- Issue #7 = dedicated sync/communication channel
- ChatGPT reads plan, context, and shared files from this repo
- ChatGPT writes by commenting on Issue #7 or editing files
- Local watcher syncs GitHub contributions into SharedBrain Redis

## Step 6 — Systemd services for auto-start

## Status

| Step | State | Notes |
|------|-------|-------|
| Step 1 — Migrate Mutik | `not_started` | Still on 192.168.80.66 |
| Step 2 — Redis Stack container | `infrastructure_live` | Container running, PING OK |
| Step 3 — MCP server | `infrastructure_live` | systemd running, health OK, RediSearch tested |
| Step 4 — Connect Cascade + Mutik | `not_started` | Server ready, clients not configured |
| Step 5 — Connect ChatGPT | `synced_manual` | Repo live, Issue #7 active, watcher pending |
| Step 6 — Systemd services | `infrastructure_live` | sharedbrain.service enabled |

See [STATE_MODEL.md](STATE_MODEL.md) for state definitions.
