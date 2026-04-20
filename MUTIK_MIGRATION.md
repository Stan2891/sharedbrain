# Mutik Migration Runbook

Copy-only migration of Mutik (OpenClaw) from `192.168.80.66` to `192.168.80.24` with zero destructive actions on source.

## Source Details (discovered)

| Item | Value |
|------|-------|
| Host | `192.168.80.66` |
| User | `stan` (not root) |
| `.openclaw` | `/home/stan/.openclaw` (~558MB) |
| `.mem0` | `/home/stan/.mem0` (~40K) |
| OpenClaw | npm package at `~/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/` |
| Gateway process | `openclaw-gateway` (Node.js, PID visible in `ps aux`) |
| mem0 server | Python venv at `~/.openclaw/workspace/.venv-mem0/`, script at `~/.openclaw/mem0-server.py` (port 9101) |
| Node version | v22.22.2 (via nvm) |

## Safety Rules

- **DO NOT** delete, move, or disable anything on source VM
- **DO NOT** stop source services during copy
- **DO NOT** use `--delete` in rsync
- **DO NOT** overwrite live destination paths during initial copy
- Each migration attempt goes into a unique timestamped folder
- Source VM stays fully operational until Stan confirms success

## Steps

### 1. Dry Run

```bash
sudo mkdir -p /opt/sharedbrain/mutik-migration
sudo DRY_RUN=1 bash /home/stan/Desktop/sharedbrain/scripts/mutik-copy-migration.sh
```

Review output — no files are actually copied.

### 2. Real Copy

```bash
sudo bash /home/stan/Desktop/sharedbrain/scripts/mutik-copy-migration.sh
```

This creates a timestamped folder at `/opt/sharedbrain/mutik-migration/YYYYMMDD-HHMMSS/`.

### 3. Validate

Check these files in the timestamped folder:
- `logs/remote-state.txt` — source processes, ports, sizes
- `logs/.openclaw-source.sha256` vs `logs/.openclaw-dest.sha256`
- `logs/.mem0-source.sha256` vs `logs/.mem0-dest.sha256`
- `logs/.openclaw-hash.diff` — should be empty (PASS)
- `logs/.mem0-hash.diff` — should be empty (PASS)
- `migration-report.txt` — summary

### 4. Staged Activation (separate step, after validation)

Only after validation passes:
1. Copy from timestamped folder to live location on 192.168.80.24
2. Install nvm + Node v22.22.2 if not already present
3. Install openclaw npm package
4. Start Mutik locally
5. Verify sessions + memory intact

### 5. Final Shutdown (Stan decision only)

Only after Stan confirms:
- Destination Mutik works correctly
- Sessions intact
- Memory intact
- No missing credentials/config

Then source VM can be decommissioned.
