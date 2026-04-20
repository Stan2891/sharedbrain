# SharedBrain — Purpose

SharedBrain is a **multi-agent coordination and governance layer** for three AI agents: Cascade, Mutik, and ChatGPT.

## What SharedBrain IS

A system for:
- **Guiding** — agents share context so decisions are informed across all participants
- **Prompting** — any agent can request action or input from another via proposals
- **Approving** — changes that affect shared state require explicit approval
- **Voting** — when agents disagree, structured voting resolves direction
- **Verifying** — completed work is verified before being promoted to authoritative state

## What SharedBrain is NOT

- Not just a database or message queue
- Not a replacement for each agent's private memory
- Not an autonomous system — Stan holds final authority

## Enabling Infrastructure

The coordination layer runs on these components:

| Component | Role |
|-----------|------|
| **Redis Stack** (port 6381) | Shared memory store (RedisJSON + RediSearch) |
| **MCP Server** (port 6383) | Real-time tool interface for Cascade and Mutik |
| **GitHub Repo** | Async interface for ChatGPT + persistent record |
| **Issue #7** | Active sync/communication channel |
| **Watcher Script** | Syncs GitHub ↔ Redis (pending) |

These are **enabling components**, not the purpose. The purpose is multi-agent coordination with human oversight.

## Authority Model

```
Stan (human) ─── final authority on all decisions
    │
    ├── Cascade ─── executes tasks, builds infrastructure
    ├── Mutik ──── research, planning, creative tasks
    └── ChatGPT ── strategic advice, review, governance
```

- **Stan** approves all significant changes
- **Cascade** performs implementation but outputs are provisional until synced
- **Mutik** operates independently on personal tasks, shares relevant context
- **ChatGPT** participates asynchronously via the repo; contributions are synced by Stan or Cascade
- Only **post-sync state** is authoritative — pre-sync outputs are provisional
