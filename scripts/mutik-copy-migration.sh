#!/usr/bin/env bash
set -Eeuo pipefail

# =============================================================================
# Mutik Copy-Only Migration Script
# Source: stan@192.168.80.66 → Destination: 192.168.80.24
# ZERO destructive actions on source VM
# =============================================================================

SRC_HOST="192.168.80.66"
SRC_USER="stan"
DST_BASE="/opt/sharedbrain/mutik-migration"
STAMP="$(date +%Y%m%d-%H%M%S)"
DST_DIR="${DST_BASE}/${STAMP}"
LOG_DIR="${DST_DIR}/logs"
REPORT="${DST_DIR}/migration-report.txt"

# Actual paths discovered on source VM
OPENCLAW_SRC="/home/stan/.openclaw"
MEM0_SRC="/home/stan/.mem0"

# openclaw is an npm package, not a standalone binary
# Binary: /home/stan/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw/openclaw.mjs
# mem0 venv: /home/stan/.openclaw/workspace/.venv-mem0/
NVM_DIR_SRC="/home/stan/.nvm"
OPENCLAW_NPM_SRC="/home/stan/.nvm/versions/node/v22.22.2/lib/node_modules/openclaw"

SSH_OPTS=( -o BatchMode=yes -o StrictHostKeyChecking=accept-new )
DRY_RUN="${DRY_RUN:-0}"

mkdir -p "${LOG_DIR}"
exec > >(tee -a "${LOG_DIR}/run.log") 2>&1

run_rsync() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    rsync -aHAXxvn --numeric-ids --info=progress2 "$@"
  else
    rsync -aHAXxv --numeric-ids --info=progress2 "$@"
  fi
}

remote() {
  ssh "${SSH_OPTS[@]}" "${SRC_USER}@${SRC_HOST}" "$@"
}

require_remote_path() {
  local p="$1"
  if ! remote "test -e '$p'"; then
    echo "ERROR: Remote path not found: $p"
    exit 1
  fi
  echo "OK: Remote path exists: $p"
}

hash_remote_tree() {
  local path="$1"
  local name
  name="$(basename "$path")"
  echo "Hashing remote ${path} ..."
  remote "cd '$path' && find . -xdev -type f -print0 | sort -z | xargs -0 sha256sum" \
    > "${LOG_DIR}/${name}-source.sha256" 2>/dev/null || true
  echo "  $(wc -l < "${LOG_DIR}/${name}-source.sha256") files hashed"
}

hash_local_tree() {
  local path="$1"
  local name
  name="$(basename "$path")"
  echo "Hashing local ${path} ..."
  (cd "$path" && find . -xdev -type f -print0 | sort -z | xargs -0 sha256sum) \
    > "${LOG_DIR}/${name}-dest.sha256" 2>/dev/null || true
  echo "  $(wc -l < "${LOG_DIR}/${name}-dest.sha256") files hashed"
}

compare_hashes() {
  local name="$1"
  if diff -u \
    "${LOG_DIR}/${name}-source.sha256" \
    "${LOG_DIR}/${name}-dest.sha256" \
    > "${LOG_DIR}/${name}-hash.diff" 2>/dev/null; then
    echo "PASS: ${name} hashes match"
    return 0
  else
    echo "WARN: ${name} hash differences found — see ${LOG_DIR}/${name}-hash.diff"
    return 1
  fi
}

capture_remote_state() {
  echo "Capturing remote state..."
  {
    echo "=== REMOTE HOST ==="
    remote "hostnamectl 2>/dev/null || hostname"
    echo
    echo "=== REMOTE OPENCLAW PROCESSES ==="
    remote "ps aux | grep -E 'openclaw-gateway|mem0-server' | grep -v grep || echo 'none running'"
    echo
    echo "=== REMOTE LISTEN PORTS ==="
    remote "ss -ltnp 2>/dev/null | grep -E ':9101|openclaw|python' || echo 'none'"
    echo
    echo "=== REMOTE DIRECTORY SIZES ==="
    remote "du -sh '${OPENCLAW_SRC}' '${MEM0_SRC}' '${OPENCLAW_NPM_SRC}' 2>/dev/null || true"
    echo
    echo "=== REMOTE FILE COUNTS ==="
    remote "echo -n '.openclaw: '; find '${OPENCLAW_SRC}' -xdev | wc -l"
    remote "echo -n '.mem0: '; find '${MEM0_SRC}' -xdev | wc -l"
    echo
    echo "=== NODE/NPM VERSION ==="
    remote "source ~/.nvm/nvm.sh 2>/dev/null; node --version; npm --version" || true
    echo
    echo "=== OPENCLAW VERSION ==="
    remote "source ~/.nvm/nvm.sh 2>/dev/null; npx openclaw --version 2>/dev/null" || true
  } > "${LOG_DIR}/remote-state.txt" 2>&1
  echo "  Saved to ${LOG_DIR}/remote-state.txt"
}

main() {
  echo "============================================="
  echo "Mutik Migration Copy Job"
  echo "============================================="
  echo "Source: ${SRC_USER}@${SRC_HOST}"
  echo "Destination: ${DST_DIR}"
  echo "Dry run: ${DRY_RUN}"
  echo "Timestamp: ${STAMP}"
  echo "============================================="
  echo

  # Verify source paths exist
  require_remote_path "${OPENCLAW_SRC}"
  require_remote_path "${MEM0_SRC}"

  # Create destination structure
  mkdir -p "${DST_DIR}/home-stan" "${DST_DIR}/npm-openclaw" "${DST_DIR}/meta"

  # Capture remote state
  capture_remote_state

  # Record source metadata
  echo "Recording source metadata..."
  remote "stat '${OPENCLAW_SRC}' '${MEM0_SRC}'" > "${LOG_DIR}/source-stat.txt" 2>&1
  remote "find '${OPENCLAW_SRC}' -xdev | wc -l; find '${MEM0_SRC}' -xdev | wc -l" \
    > "${LOG_DIR}/source-file-counts.txt" 2>&1

  # Hash source trees
  hash_remote_tree "${OPENCLAW_SRC}"
  hash_remote_tree "${MEM0_SRC}"

  # Copy ~/.openclaw
  echo
  echo ">>> Copying ~/.openclaw ..."
  run_rsync -e "ssh ${SSH_OPTS[*]}" \
    "${SRC_USER}@${SRC_HOST}:${OPENCLAW_SRC}/" \
    "${DST_DIR}/home-stan/.openclaw/"

  # Copy ~/.mem0
  echo
  echo ">>> Copying ~/.mem0 ..."
  run_rsync -e "ssh ${SSH_OPTS[*]}" \
    "${SRC_USER}@${SRC_HOST}:${MEM0_SRC}/" \
    "${DST_DIR}/home-stan/.mem0/"

  # Copy the openclaw npm package
  echo
  echo ">>> Copying openclaw npm package ..."
  run_rsync -e "ssh ${SSH_OPTS[*]}" \
    "${SRC_USER}@${SRC_HOST}:${OPENCLAW_NPM_SRC}/" \
    "${DST_DIR}/npm-openclaw/"

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo
    echo "============================================="
    echo "DRY RUN COMPLETE — no files were copied"
    echo "============================================="
    exit 0
  fi

  # Hash destination trees
  echo
  hash_local_tree "${DST_DIR}/home-stan/.openclaw"
  hash_local_tree "${DST_DIR}/home-stan/.mem0"

  # Compare hashes
  echo
  echo "Comparing source vs destination hashes..."
  OPENCLAW_OK=0
  MEM0_OK=0
  compare_hashes ".openclaw" && OPENCLAW_OK=1
  compare_hashes ".mem0" && MEM0_OK=1

  # Generate report
  {
    echo "============================================="
    echo "Mutik Migration Copy Report"
    echo "============================================="
    echo "Timestamp: ${STAMP}"
    echo "Source: ${SRC_USER}@${SRC_HOST}"
    echo "Destination: ${DST_DIR}"
    echo
    echo "Copied:"
    echo "  ~/.openclaw → ${DST_DIR}/home-stan/.openclaw/"
    echo "  ~/.mem0 → ${DST_DIR}/home-stan/.mem0/"
    echo "  openclaw npm → ${DST_DIR}/npm-openclaw/"
    echo
    echo "Hash verification:"
    echo "  .openclaw: $([ $OPENCLAW_OK -eq 1 ] && echo 'PASS' || echo 'DIFFERENCES FOUND')"
    echo "  .mem0: $([ $MEM0_OK -eq 1 ] && echo 'PASS' || echo 'DIFFERENCES FOUND')"
    echo
    echo "SAFETY:"
    echo "  - Source VM remains UNTOUCHED"
    echo "  - No source services stopped"
    echo "  - No cutover performed"
    echo "  - Do NOT shut down source until Stan confirms"
    echo "============================================="
  } | tee "${REPORT}"

  echo
  echo "Migration copy completed successfully."
  echo "Report: ${REPORT}"
  echo "Logs: ${LOG_DIR}/"
}

main "$@"
