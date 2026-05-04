#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Premium-only paths expected to be absent from OSS after merge.
FORBIDDEN_PATHS=(
  "worklenz-client-portal"
  "worklenz-backend/src/routes/apis/client-portal-api-router.ts"
  "worklenz-backend/src/routes/apis/slack-api-router.ts"
  "worklenz-backend/src/routes/apis/project-finance-api-router.ts"
  "worklenz-backend/src/routes/apis/billing-api-router.ts"
  "worklenz-backend/src/routes/apis/plan-trial-api-router.ts"
  "worklenz-backend/src/routes/apis/subscriptions-api-router.ts"
  "worklenz-backend/src/routes/apis/plans-api-router.ts"
  "worklenz-backend/src/routes/apis/users-api-router.ts"
  "worklenz-backend/src/controllers/slack-controller.ts"
  "worklenz-backend/src/controllers/billing-controller.ts"
  "worklenz-backend/src/controllers/client-portal"
  "worklenz-frontend/src/features/clients-portal"
  "worklenz-frontend/src/features/client-view"
  "worklenz-frontend/src/features/projects/finance"
  "worklenz-frontend/src/components/LicenseExpiredModal"
  "worklenz-frontend/src/pages/license-expired"
  "worklenz-frontend/src/features/navbar/upgrade-plan"
  "docs"
)

HAS_FAILURE=0

echo "[verify-oss-clean] checking forbidden premium paths..."
for path in "${FORBIDDEN_PATHS[@]}"; do
  if [[ -e "$path" ]]; then
    echo "[verify-oss-clean] found forbidden path: $path"
    HAS_FAILURE=1
  fi
done

if [[ "$HAS_FAILURE" -ne 0 ]]; then
  echo "[verify-oss-clean] FAILED: OSS tree still contains premium markers."
  exit 1
fi

echo "[verify-oss-clean] OK: no forbidden premium paths detected."
