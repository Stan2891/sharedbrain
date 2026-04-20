# SharedBrain

Multi-agent coordination and governance layer for three AI agents: **Cascade**, **Mutik**, and **ChatGPT**.

SharedBrain enables guiding, prompting, approving, voting, and verifying across agents — with Stan (human) as final authority.

## Connections
- **Cascade** (Windsurf/Claude) and **Mutik** (OpenClaw) connect via MCP server (port 6383)
- **ChatGPT** (Web Business) syncs via this GitHub repo + [Issue #7](https://github.com/Stan2891/sharedbrain/issues/7)

## Docs
- [PURPOSE.md](PURPOSE.md) — what SharedBrain is and why
- [PROTOCOL.md](PROTOCOL.md) — governance protocol (proposals, approvals, voting)
- [STATE_MODEL.md](STATE_MODEL.md) — system state levels and current status
- [PLAN.md](PLAN.md) — architecture and implementation steps
- [AGENTS.md](AGENTS.md) — agent directory and capabilities
