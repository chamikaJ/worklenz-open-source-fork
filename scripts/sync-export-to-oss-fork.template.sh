#!/usr/bin/env bash
set -euo pipefail

# Sync sanitized export from business repo into an OSS fork working tree.
# Usage:
#   ./scripts/sync-export-to-oss-fork.template.sh --oss-dir /path/to/oss-fork [--dry-run]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OSS_DIR=""
DRY_RUN=false
WORK_DIR="${TMPDIR:-/tmp}/worklenz-oss-sync"
EXPORT_DIR="${WORK_DIR}/export"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --oss-dir)
      OSS_DIR="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
      EXPORT_DIR="${WORK_DIR}/export"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$OSS_DIR" ]]; then
  echo "Usage: $0 --oss-dir /path/to/oss-fork [--dry-run] [--work-dir /tmp/path]"
  exit 1
fi

if [[ ! -d "$OSS_DIR" ]]; then
  echo "OSS dir not found: $OSS_DIR"
  exit 1
fi

EXPORT_SCRIPT="${ROOT_DIR}/scripts/export-to-oss.template.sh"
if [[ ! -x "$EXPORT_SCRIPT" ]]; then
  echo "Missing executable export script: $EXPORT_SCRIPT"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

mkdir -p "$WORK_DIR"

echo "[sync-oss] creating sanitized export..."
"$EXPORT_SCRIPT" "$EXPORT_DIR"

RSYNC_ARGS=(
  -a
  --delete
  --exclude .git
  --exclude node_modules
  --exclude build
  --exclude dist
)

if [[ "$DRY_RUN" == "true" ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
  echo "[sync-oss] dry-run mode enabled"
fi

echo "[sync-oss] syncing export -> OSS fork"
rsync "${RSYNC_ARGS[@]}" "$EXPORT_DIR/" "$OSS_DIR/"

echo "[sync-oss] verifying OSS fork cleanliness"
if [[ -x "$OSS_DIR/scripts/verify-oss-clean.sh" ]]; then
  (cd "$OSS_DIR" && ./scripts/verify-oss-clean.sh)
else
  echo "[sync-oss] warning: verify script missing in OSS dir"
fi

echo "[sync-oss] git summary"
(
  cd "$OSS_DIR"
  git status --short
)

echo "[sync-oss] done"
