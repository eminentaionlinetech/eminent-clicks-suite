#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Eminent Clicks - PayChaser Smoke Test (Non-Mutating)
# Target Project Reference: aqnnjcjemhdablsbxlah
#
# SAFETY GUARANTEE:
# - Invokes Edge Function 'process-invoice-reminders' with action: "smoke_test".
# - Does NOT query customer or invoice records.
# - Does NOT claim reminder rows or update reminder statuses.
# - Does NOT send any emails.
# - Does NOT leak secrets or tokens in output.
# ==============================================================================

EXPECTED_PROJECT_REF="aqnnjcjemhdablsbxlah"
FUNCTION_URL="${SUPABASE_URL:-https://${EXPECTED_PROJECT_REF}.supabase.co}/functions/v1/process-invoice-reminders"

echo "=========================================================="
echo "  Eminent Clicks: PayChaser Smoke Test (Non-Mutating)"
echo "=========================================================="

if [ -z "${USER_JWT:-}" ]; then
  echo "ERROR: USER_JWT environment variable is not set." >&2
  echo "A short-lived user session token is required to test the authenticated endpoint." >&2
  echo "Usage: USER_JWT=\"<user_access_token>\" ./scripts/paychaser-smoke-test.sh" >&2
  exit 1
fi

echo "Invoking smoke check at: ${FUNCTION_URL}"
RESPONSE="$(curl -s -w "\n%{http_code}" -X POST "${FUNCTION_URL}" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{"action":"smoke_test"}')"

HTTP_STATUS="$(echo "${RESPONSE}" | tail -n1)"
BODY="$(echo "${RESPONSE}" | sed '$d')"

echo "HTTP Response Status: ${HTTP_STATUS}"
echo "Response Body:"
echo "${BODY}"

if [ "${HTTP_STATUS}" -eq 200 ]; then
  echo "Smoke check passed successfully. Zero mutations performed."
else
  echo "Smoke check failed or returned non-200 status." >&2
  exit 1
fi
