#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Eminent Clicks - PayChaser Automated Reminders Preflight (Read-Only)
# Target Project Reference: aqnnjcjemhdablsbxlah
#
# SAFETY GUARANTEE:
# - Strictly read-only diagnostics and preflight validation.
# - Does NOT apply migrations or execute SQL against production.
# - Does NOT deploy Edge Functions.
# - Does NOT modify records or print secret values / tokens.
# ==============================================================================

EXPECTED_PROJECT_REF="aqnnjcjemhdablsbxlah"
EXPECTED_BRANCH="feature/automated-invoice-reminders-jobflow"

echo "=========================================================="
echo "  Eminent Clicks: PayChaser Preflight Check (Read-Only)"
echo "=========================================================="

# 1. Branch check
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
echo "[1/6] Checking Git branch: ${CURRENT_BRANCH}"
if [ "${CURRENT_BRANCH}" != "${EXPECTED_BRANCH}" ]; then
  echo "      WARNING: Currently on branch '${CURRENT_BRANCH}', expected '${EXPECTED_BRANCH}'."
else
  echo "      Branch verified."
fi

# 2. Check for required repository files
echo "[2/6] Verifying repository migration and function files..."
MIGRATION_FILE="supabase/migrations/20261017100000_paychaser_automatic_reminders.sql"
WORKER_FILE="supabase/functions/process-invoice-reminders/index.ts"
CONFIG_FILE="supabase/config.toml"

for f in "${MIGRATION_FILE}" "${WORKER_FILE}" "${CONFIG_FILE}"; do
  if [ ! -f "${f}" ]; then
    echo "      ERROR: Missing required file: ${f}" >&2
    exit 1
  fi
done
echo "      Required files are present."

# 3. Check configured project_id in supabase/config.toml
echo "[3/6] Checking configured project reference in supabase/config.toml..."
CONFIG_PROJECT_ID="$(grep 'project_id' "${CONFIG_FILE}" | head -n1 | sed -E 's/.*=[[:space:]]*["'\'']?([^"'\'']+)["'\'']?.*/\1/' || echo "")"
if [ "${CONFIG_PROJECT_ID}" != "${EXPECTED_PROJECT_REF}" ]; then
  echo "      ERROR: config.toml project_id is '${CONFIG_PROJECT_ID}', expected '${EXPECTED_PROJECT_REF}'." >&2
  exit 1
fi
echo "      Configured project reference matches: ${EXPECTED_PROJECT_REF}"

# 4. Check Supabase CLI availability
echo "[4/6] Checking Supabase CLI availability..."
if ! command -v supabase >/dev/null 2>&1; then
  echo "      ERROR: Supabase CLI ('supabase') is not installed or not on PATH." >&2
  echo "      To install, see: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi
CLI_VERSION="$(supabase --version 2>/dev/null || echo "installed")"
echo "      Supabase CLI is available (${CLI_VERSION})."

# 5. Check Supabase CLI authentication and remote project link
echo "[5/6] Checking Supabase CLI authentication and linked project..."

# Step 5a: Verify authentication via exit code of 'supabase projects list'
AUTH_OUTPUT=""
if ! AUTH_OUTPUT="$(supabase projects list 2>&1)"; then
  echo "      --------------------------------------------------------"
  echo "      STATUS: Supabase CLI authentication check failed."
  echo "      Explanation: 'supabase projects list' exited with non-zero status."
  echo "      Action required: Run 'supabase login' or configure SUPABASE_ACCESS_TOKEN."
  echo "      Exiting safely without attempting remote database operations."
  echo "      --------------------------------------------------------"
  exit 2
fi

# Step 5b: Verify linked project reference
# In Supabase CLI, 'supabase link' writes the linked project ref to supabase/.temp/project-ref
# Fallback inspection checks if 'supabase projects list' contains the expected ref
LINKED_PROJECT_REF=""
if [ -f "supabase/.temp/project-ref" ]; then
  LINKED_PROJECT_REF="$(tr -d '[:space:]' < "supabase/.temp/project-ref")"
fi

if [ -n "${LINKED_PROJECT_REF}" ]; then
  if [ "${LINKED_PROJECT_REF}" != "${EXPECTED_PROJECT_REF}" ]; then
    echo "      --------------------------------------------------------"
    echo "      ERROR: Linked project is '${LINKED_PROJECT_REF}', expected '${EXPECTED_PROJECT_REF}'." >&2
    echo "      Action required: Run 'supabase link --project-ref ${EXPECTED_PROJECT_REF}'" >&2
    echo "      --------------------------------------------------------" >&2
    exit 3
  fi
  echo "      Verified linked project from supabase/.temp/project-ref: ${LINKED_PROJECT_REF}"
else
  # If local link marker is missing, check if expected project is present in projects list
  if ! echo "${AUTH_OUTPUT}" | grep -q "${EXPECTED_PROJECT_REF}"; then
    echo "      --------------------------------------------------------"
    echo "      ERROR: Project '${EXPECTED_PROJECT_REF}' not found in active account projects list." >&2
    echo "      Action required: Run 'supabase link --project-ref ${EXPECTED_PROJECT_REF}'" >&2
    echo "      --------------------------------------------------------" >&2
    exit 3
  fi
  echo "      Target project '${EXPECTED_PROJECT_REF}' is verified in active account."
fi

# 6. Database migration dry-run (strictly read-only)
echo "[6/6] Executing migration dry-run (--dry-run --linked)..."
echo "      NOTE: --dry-run simulates the migration diff. It CANNOT apply SQL or modify data."
echo "      --------------------------------------------------------"

set +e
DRY_RUN_OUTPUT="$(supabase db push --dry-run --linked 2>&1)"
DRY_RUN_STATUS=$?
set -e

echo "${DRY_RUN_OUTPUT}"
echo "      --------------------------------------------------------"

if [ "${DRY_RUN_STATUS}" -ne 0 ]; then
  echo "      ERROR: Database migration dry-run failed with exit code ${DRY_RUN_STATUS}." >&2
  echo "      Review the output above for schema or connectivity errors." >&2
  exit 4
fi

echo "      Dry-run simulation succeeded with exit code 0."
echo "=========================================================="
echo "  PayChaser Preflight Check Complete (No data was modified)"
echo "=========================================================="
