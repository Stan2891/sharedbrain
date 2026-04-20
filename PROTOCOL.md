# SharedBrain — Governance Protocol

Lightweight protocol for multi-agent coordination, proposals, approvals, and verification.

## Message Types

All messages on Issue #7 or in SharedBrain Redis use one of these types:

| Type | Purpose | Who can send |
|------|---------|--------------|
| `status` | Progress update, no action needed | Any agent |
| `proposal` | Suggest a change or action for review | Any agent |
| `review` | Feedback on a proposal (approve, reject, request changes) | Any agent |
| `approval` | Explicit sign-off on a proposal | Stan or designated agent |
| `vote` | Cast a vote on a contested decision | Any agent |
| `verification` | Confirm completed work meets requirements | Any agent |
| `memory` | Shared fact or context to remember | Any agent |
| `question` | Request input from specific agent(s) | Any agent |

## Message Format

```
**[AGENT_NAME]** — [ISO timestamp]
Type: [message_type]

[content]

Tags: tag1, tag2
Importance: 1-10
```

## Proposal Flow

```
proposal → reviewed → approved → executed → verified
                ↓
          rejected / changes_requested
```

1. **Proposal** — Any agent proposes a change with rationale
2. **Review** — Other agents provide feedback
3. **Approval** — Stan (or delegated agent) approves
4. **Execution** — Cascade (or designated agent) implements
5. **Verification** — Any agent confirms the result matches the proposal

## Voting Protocol

When agents disagree:

1. The disagreement is stated clearly with each position
2. Each agent casts a `vote` message with reasoning
3. Stan has **veto authority** — his vote overrides all others
4. If Stan abstains, majority wins (2 of 3 agents)
5. Ties are resolved by the agent with domain expertise for that topic

## Conflict Handling

- Conflicts are flagged with Type: `proposal` and tag `conflict`
- Each agent states their position
- Resolution follows the voting protocol above
- The resolved decision is recorded as a `memory` with tag `decision`

## Sync Boundaries

| State | Meaning | Authority |
|-------|---------|-----------|
| `provisional` | Agent produced output, not yet synced | Not authoritative |
| `synced` | Pushed to repo or Redis by Stan/Cascade | Authoritative shared state |
| `verified` | Another agent confirmed correctness | Highest confidence |

**Rule:** Only post-sync state should be used for approvals, voting, or verification. Pre-sync outputs are provisional drafts.

## Approval Authority

| Action | Required approval |
|--------|-------------------|
| Infrastructure changes | Stan |
| Shared memory schema changes | Stan |
| Agent config changes | Stan |
| New tool additions | Stan + 1 agent review |
| Documentation updates | Any agent (auto-approved) |
| Memory saves | Any agent (auto-approved) |
| Proposals affecting all agents | Stan + majority vote |
