#!/usr/bin/env bash
set -euo pipefail

# Template script for private repo: worklenz-business-overlay/scripts/compose-business.sh
# Copy this script to the PRIVATE overlay repo and adjust paths only if needed.

PUBLIC_REPO_DIR="${PUBLIC_REPO_DIR:-/opt/worklenz/worklenz}"
OVERLAY_REPO_DIR="${OVERLAY_REPO_DIR:-/opt/worklenz/worklenz-business-overlay}"
BUILD_DIR="${BUILD_DIR:-/opt/worklenz/build-business}"
MANIFEST_FILE="${BUILD_DIR}/.overlay-manifest.txt"

REQUIRED_OVERLAY_PATHS=(
  "overlay"
  "docker-compose.business.yml"
)

echo "[compose-business] public repo:  ${PUBLIC_REPO_DIR}"
echo "[compose-business] overlay repo: ${OVERLAY_REPO_DIR}"
echo "[compose-business] build dir:    ${BUILD_DIR}"

[[ -d "${PUBLIC_REPO_DIR}" ]] || { echo "Missing public repo: ${PUBLIC_REPO_DIR}"; exit 1; }
[[ -d "${OVERLAY_REPO_DIR}" ]] || { echo "Missing overlay repo: ${OVERLAY_REPO_DIR}"; exit 1; }

for path in "${REQUIRED_OVERLAY_PATHS[@]}"; do
  [[ -e "${OVERLAY_REPO_DIR}/${path}" ]] || { echo "Missing overlay requirement: ${OVERLAY_REPO_DIR}/${path}"; exit 1; }
done

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Sync OSS repo into ephemeral build workspace.
rsync -a --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "build" \
  --exclude "dist" \
  "${PUBLIC_REPO_DIR}/" "${BUILD_DIR}/"

# Apply private overlay files on top of OSS workspace.
rsync -a "${OVERLAY_REPO_DIR}/overlay/" "${BUILD_DIR}/"

# Bring in private compose file.
cp "${OVERLAY_REPO_DIR}/docker-compose.business.yml" "${BUILD_DIR}/docker-compose.business.yml"

# Basic sanity checks
[[ -f "${BUILD_DIR}/docker-compose.business.yml" ]] || { echo "Missing docker-compose.business.yml in build dir"; exit 1; }
[[ -f "${BUILD_DIR}/worklenz-backend/package.json" ]] || { echo "Backend missing in composed build"; exit 1; }
[[ -f "${BUILD_DIR}/worklenz-frontend/package.json" ]] || { echo "Frontend missing in composed build"; exit 1; }

# Optional: reject unresolved placeholders
if command -v rg >/dev/null 2>&1; then
  if rg -n "__REPLACE_ME__|__PRIVATE_OVERLAY_REQUIRED__" "${BUILD_DIR}" >/dev/null 2>&1; then
    echo "Found unresolved placeholders in composed build"
    rg -n "__REPLACE_ME__|__PRIVATE_OVERLAY_REQUIRED__" "${BUILD_DIR}"
    exit 1
  fi
else
  if grep -RnsE "__REPLACE_ME__|__PRIVATE_OVERLAY_REQUIRED__" "${BUILD_DIR}" >/dev/null 2>&1; then
    echo "Found unresolved placeholders in composed build"
    grep -RnsE "__REPLACE_ME__|__PRIVATE_OVERLAY_REQUIRED__" "${BUILD_DIR}" || true
    exit 1
  fi
fi

# Emit manifest of overlay-applied files
(
  cd "${OVERLAY_REPO_DIR}/overlay"
  find . -type f | sort
) > "${MANIFEST_FILE}"

echo "[compose-business] overlay applied successfully."
echo "[compose-business] manifest: ${MANIFEST_FILE}"
