#!/usr/bin/env bash
# Example: OpenClaw local backup + optional rclone upload to Google Drive.
# Copy to your host, edit variables, chmod +x, run from cron or systemd (not from an LLM).
set -euo pipefail

# Where to write the timestamped .tar.gz (must NOT be inside a directory being archived).
BACKUP_DIR="${BACKUP_DIR:-/var/backups/openclaw}"

# Set to 1 to skip agent workspace trees (use when the workspace is already in private git).
NO_WORKSPACE="${NO_WORKSPACE:-1}"

# rclone remote and path (create with: rclone config)
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive}"
RCLONE_DEST="${RCLONE_DEST:-openclaw-backups}"

# Optional: workspace-relative memory indexes (not prose memory/*.md). Comment out if unused.
# WORKSPACE_ROOT must match agents.defaults.workspace (or your agent workspace) on this host.
WORKSPACE_ROOT="${WORKSPACE_ROOT:-}"
MEMORY_DOT_DIR="${MEMORY_DOT_DIR:-.memory}"

run_backup() {
  local -a args=(backup create --output "$BACKUP_DIR" --verify)
  if [[ "$NO_WORKSPACE" == "1" ]]; then
    args+=(--no-include-workspace)
  fi
  openclaw "${args[@]}"
}

upload_latest() {
  # Upload newest openclaw backup tarball in BACKUP_DIR.
  local newest
  newest="$(ls -1t "$BACKUP_DIR"/*-openclaw-backup.tar.gz 2>/dev/null | head -1 || true)"
  if [[ -z "$newest" ]]; then
    echo "No tarball found under $BACKUP_DIR" >&2
    exit 1
  fi
  rclone copy "$newest" "${RCLONE_REMOTE}:${RCLONE_DEST}/" --progress
}

upload_workspace_memory() {
  if [[ -z "$WORKSPACE_ROOT" ]]; then
    return 0
  fi
  local mem="${WORKSPACE_ROOT%/}/${MEMORY_DOT_DIR}"
  if [[ -d "$mem" ]]; then
    rclone copy "$mem" "${RCLONE_REMOTE}:${RCLONE_DEST}/workspace-memory/$(date -u +%Y-%m-%d)/" --progress
  fi
}

# --- main ---
mkdir -p "$BACKUP_DIR"
run_backup

if [[ "${RCLONE_UPLOAD:-0}" == "1" ]]; then
  upload_latest
  upload_workspace_memory
fi
