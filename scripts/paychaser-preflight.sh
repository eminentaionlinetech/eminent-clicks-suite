#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Eminent Clicks - PayChaser Automated Reminders Preflight (Read-Only)
# Target Project Reference: aqnnjcjemhdablsbxlah
#
# SAFETY GUARANTEE:
# - This script performs strictly read-only diagnostics and preflight validation.
# - It does NOT apply database migrations.
# - It does NOT deploy Edge Functions.
# - It does NOT modify or leak secrets, customer records, or invoices.
# - Any dry-run command is executed with --dry-run and cannot mutate the database.
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

# 5. Check Supabase CLI authentication and project link
echo "[5/6] Checking Supabase CLI authentication and linked project..."

# Test if Supabase CLI has an active login session or access token
AUTH_CHECK_OUTPUT="$(supabase projects list 2>&1 || true)"
if echo "${AUTH_CHECK_OUTPUT}" | grep -iqE "not logged in|login|unauthorized|unauthenticated|access token"; then
  echo "      --------------------------------------------------------"
  echo "      STATUS: Supabase CLI is NOT authenticated."
  echo "      Explanation: A valid Supabase CLI session is required to perform remote checks."
  echo "      Action required: Run 'supabase login' to authenticate your CLI."
  echo "      Exiting safely without attempting remote database operations."
  echo "      --------------------------------------------------------"
  exit 0
fi

# Check if CLI is linked to the intended project reference
LINK_STATUS_OUTPUT="$(supabase status 2>&1 || true)"
if ! echo "${AUTH_CHECK_OUTPUT} ${LINK_STATUS_OUTPUT}" | grep -q "${EXPECTED_PROJECT_REF}"; then
  echo "      --------------------------------------------------------"
  echo "      STATUS: Supabase CLI is authenticated, but not linked to ${EXPECTED_PROJECT_REF}."
  echo "      Action required: Run 'supabase link --project-ref ${EXPECTED_PROJECT_REF}'"
  echo "      Exiting safely without attempting remote database operations."
  echo "      --------------------------------------------------------"
  exit 0
fi
echo "      Authenticated and linked to project: ${EXPECTED_PROJECT_REF}"

# 6. Database migration dry-run (strictly read-only)
echo "[6/6] Executing migration dry-run (--dry-run)..."
echo "      NOTE: --dry-run simulates the migration diff. It CANNOT apply SQL or modify data."
echo "      Dry-run output:"
echo "      --------------------------------------------------------"
DRY_RUN_OUTPUT="$(supabase db push --dry-run --linked 2>&1 || true)"
echo "${DRY_RUN_OUTPUT}"
echo "      --------------------------------------------------------"
echo "      Dry-run simulation finished."

echo "=========================================================="
echo "  PayChaser Preflight Check Complete (No data was modified)"
echo "=========================================================="
