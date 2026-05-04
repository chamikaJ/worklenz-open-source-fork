#!/usr/bin/env bash
set -euo pipefail

# Run this script from business repo to produce a sanitized OSS snapshot in a target directory.
# Intended usage:
#   ./scripts/export-to-oss.template.sh /tmp/worklenz-oss-export
# Then rsync/commit into your OSS fork working tree.

TARGET_DIR="${1:-}"
if [[ -z "${TARGET_DIR}" ]]; then
  echo "Usage: $0 <target-dir>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXCLUDE_LIST="${ROOT_DIR}/scripts/oss-exclude-paths.txt"

if [[ ! -f "${EXCLUDE_LIST}" ]]; then
  echo "Missing exclude list: ${EXCLUDE_LIST}"
  exit 1
fi

echo "[export-to-oss] source: ${ROOT_DIR}"
echo "[export-to-oss] target: ${TARGET_DIR}"

rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"

# Initial copy (exclude git and build artifacts)
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "build" \
  --exclude "dist" \
  --exclude ".codex" \
  "${ROOT_DIR}/" "${TARGET_DIR}/"

# Remove business-only paths
while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%%#*}"
  path="$(echo "$line" | xargs)"
  [[ -z "$path" ]] && continue

  # Handle glob patterns safely
  shopt -s nullglob
  matches=("${TARGET_DIR}/${path}")
  shopt -u nullglob

  for match in "${matches[@]}"; do
    if [[ -e "$match" ]]; then
      rm -rf "$match"
      echo "[export-to-oss] removed: ${match#${TARGET_DIR}/}"
    fi
  done
done < "${EXCLUDE_LIST}"

# Force OSS-safe defaults in env template if present
ENV_TEMPLATE="${TARGET_DIR}/worklenz-backend/.env.template"
if [[ -f "${ENV_TEMPLATE}" ]]; then
  sed -i 's/^ENABLE_BUSINESS_FEATURES=.*/ENABLE_BUSINESS_FEATURES=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_PROJECT_FINANCE=.*/ENABLE_PROJECT_FINANCE=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_SLACK_INTEGRATION=.*/ENABLE_SLACK_INTEGRATION=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_CLIENT_PORTAL=.*/ENABLE_CLIENT_PORTAL=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_BUSINESS_BILLING=.*/ENABLE_BUSINESS_BILLING=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_BUSINESS_PLAN_TRIALS=.*/ENABLE_BUSINESS_PLAN_TRIALS=false/' "${ENV_TEMPLATE}" || true
  sed -i 's/^ENABLE_BUSINESS_SUBSCRIPTIONS=.*/ENABLE_BUSINESS_SUBSCRIPTIONS=false/' "${ENV_TEMPLATE}" || true
fi

# Validate exported tree using OSS validator if present
if [[ -x "${TARGET_DIR}/scripts/verify-oss-clean.sh" ]]; then
  echo "[export-to-oss] running verify-oss-clean.sh"
  (cd "${TARGET_DIR}" && ./scripts/verify-oss-clean.sh)
fi

echo "[export-to-oss] done"
