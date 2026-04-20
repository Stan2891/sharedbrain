# SharedBrain — State Model

Defines the lifecycle states for SharedBrain components and work items.

## System State Levels

Each component or deliverable moves through these states:

```
infrastructure_live → agent_connected → completed_local → synced_manual → verified → approved
```

| State | Definition |
|-------|------------|
| `infrastructure_live` | Service is running and reachable (e.g., Redis responds to PING, MCP server returns health OK) |
| `agent_connected` | An agent has successfully connected and can use the service (e.g., Cascade can call MCP tools) |
| `completed_local` | Work is done locally but not yet pushed/synced to shared state |
| `synced_manual` | Stan or Cascade has pushed the work to the shared repo or Redis — this is the **authoritative checkpoint** |
| `verified` | Another agent has independently confirmed the work is correct |
| `approved` | Stan has explicitly signed off |

## Current Component Status

| Component | State | Notes |
|-----------|-------|-------|
| GitHub repo | `synced_manual` | Live, pushed, ChatGPT has read it |
| Redis Stack (6381) | `infrastructure_live` | Container running, PING OK |
| MCP Server (6383) | `infrastructure_live` | systemd service running, health OK |
| RediSearch index | `infrastructure_live` | `idx:memories` created, tested |
| Cascade → MCP | `infrastructure_live` | Server ready, Cascade not yet configured as MCP client |
| Mutik migration | `not_started` | Still on 192.168.80.66 |
| Mutik → MCP | `not_started` | Depends on migration |
| GitHub ↔ Redis watcher | `not_started` | Sync script not yet built |
| PURPOSE.md | `synced_manual` | Created per ChatGPT governance request |
| PROTOCOL.md | `synced_manual` | Created per ChatGPT governance request |
| STATE_MODEL.md | `synced_manual` | This file |

## Work Item Lifecycle

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────────┐    ┌──────────┐    ┌──────────┐
│ proposed  │───►│ in_progress  │───►│ completed   │───►│ synced_manual │───►│ verified │───►│ approved │
└──────────┘    └──────────────┘    │ (local)     │    └───────────────┘    └──────────┘    └──────────┘
                                    └─────────────┘
```

- **proposed** — raised by any agent
- **in_progress** — being worked on by assigned agent
- **completed (local)** — done but provisional
- **synced_manual** — pushed to shared state by Stan or Cascade
- **verified** — another agent confirmed
- **approved** — Stan signed off
