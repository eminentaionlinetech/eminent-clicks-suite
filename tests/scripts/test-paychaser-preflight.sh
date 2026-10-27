#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Isolated Unit Tests for scripts/paychaser-preflight.sh
# Mocks all external dependencies:
# - git
# - supabase CLI
# - filesystem artifacts
# ZERO live network or database calls.
# ==============================================================================

TEST_TMP_DIR="$(mktemp -d /tmp/preflight-test.XXXXXX)"
SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/paychaser-preflight.sh"
if [ ! -f "${SCRIPT_UNDER_TEST}" ]; then
  # Fallback to local copy if running from /tmp
  SCRIPT_UNDER_TEST="/tmp/paychaser-preflight.sh"
fi

trap 'rm -rf "${TEST_TMP_DIR}"' EXIT

setup_mock_repo() {
  local dir="$1"
  mkdir -p "${dir}/supabase/migrations"
  mkdir -p "${dir}/supabase/functions/process-invoice-reminders"
  mkdir -p "${dir}/bin"

  touch "${dir}/supabase/migrations/20261017100000_paychaser_automatic_reminders.sql"
  touch "${dir}/supabase/functions/process-invoice-reminders/index.ts"
  echo 'project_id = "aqnnjcjemhdablsbxlah"' > "${dir}/supabase/config.toml"

  # Mock git binary
  cat << 'MOCK_GIT' > "${dir}/bin/git"
#!/usr/bin/env bash
if [ "$1" = "rev-parse" ]; then
  echo "feature/automated-invoice-reminders-jobflow"
  exit 0
fi
exec /usr/bin/git "$@"
MOCK_GIT
  chmod +x "${dir}/bin/git"
}

PASSED=0
FAILED=0

run_test() {
  local name="$1"
  local expected_exit="$2"
  local test_env_dir="${TEST_TMP_DIR}/${name}"
  mkdir -p "${test_env_dir}"
  setup_mock_repo "${test_env_dir}"

  shift 2
  # Remaining args configure mock supabase behavior

  local mock_supabase_script="$1"
  cat << MOCK_SUPA > "${test_env_dir}/bin/supabase"
#!/usr/bin/env bash
${mock_supabase_script}
MOCK_SUPA
  chmod +x "${test_env_dir}/bin/supabase"

  if [ -n "${2:-}" ]; then
    # Custom pre-setup hook
    eval "$2"
  fi

  set +e
  (
    cd "${test_env_dir}"
    PATH="${test_env_dir}/bin:${PATH}" "${SCRIPT_UNDER_TEST}" > "${test_env_dir}/output.log" 2>&1
  )
  local actual_exit=$?
  set -e

  if [ "${actual_exit}" -eq "${expected_exit}" ]; then
    echo "✓ PASS: ${name} (Exit code ${actual_exit})"
    PASSED=$((PASSED + 1))
  else
    echo "✗ FAIL: ${name} (Expected ${expected_exit}, got ${actual_exit})"
    echo "--- Output ---"
    cat "${test_env_dir}/output.log"
    echo "--------------"
    FAILED=$((FAILED + 1))
  fi
}

echo "=========================================================="
echo "  Running PayChaser Preflight Unit Tests (Mocked)"
echo "=========================================================="

# Test 1: Missing CLI binary
run_test "missing_cli" 1 '
exit 127
' 'rm -f "${test_env_dir}/bin/supabase"'

# Test 2: Unauthenticated CLI (projects list fails with non-zero)
run_test "unauthenticated_cli" 2 '
if [ "$1" = "projects" ] && [ "$2" = "list" ]; then
  echo "Error: You are not logged in. Please run supabase login." >&2
  exit 1
fi
if [ "$1" = "--version" ]; then
  echo "1.200.0"
  exit 0
fi
exit 0
'

# Test 3: Authenticated, but linked to wrong project reference
run_test "wrong_linked_project" 3 '
if [ "$1" = "--version" ]; then
  echo "1.200.0"; exit 0
fi
if [ "$1" = "projects" ] && [ "$2" = "list" ]; then
  echo "LINKED  PROJECT ID  NAME"
  echo "        other_ref   Other Project"
  exit 0
fi
exit 0
' 'mkdir -p "${test_env_dir}/supabase/.temp" && echo "wrong_project_ref" > "${test_env_dir}/supabase/.temp/project-ref"'

# Test 4: Authenticated and linked, but db push --dry-run fails
run_test "dry_run_failure" 4 '
if [ "$1" = "--version" ]; then echo "1.200.0"; exit 0; fi
if [ "$1" = "projects" ] && [ "$2" = "list" ]; then
  echo "LINKED  PROJECT ID          NAME"
  echo "•       aqnnjcjemhdablsbxlah Eminent Clicks"
  exit 0
fi
if [ "$1" = "db" ] && [ "$2" = "push" ]; then
  echo "Error: remote database connection failed" >&2
  exit 1
fi
exit 0
' 'mkdir -p "${test_env_dir}/supabase/.temp" && echo "aqnnjcjemhdablsbxlah" > "${test_env_dir}/supabase/.temp/project-ref"'

# Test 5: All checks pass (CLI present, authenticated, correct project, dry-run succeeds)
run_test "all_checks_pass" 0 '
if [ "$1" = "--version" ]; then echo "1.200.0"; exit 0; fi
if [ "$1" = "projects" ] && [ "$2" = "list" ]; then
  echo "LINKED  PROJECT ID          NAME"
  echo "•       aqnnjcjemhdablsbxlah Eminent Clicks"
  exit 0
fi
if [ "$1" = "db" ] && [ "$2" = "push" ]; then
  echo "Connecting to remote database..."
  echo "Finished supabase db push (dry run)."
  exit 0
fi
exit 0
' 'mkdir -p "${test_env_dir}/supabase/.temp" && echo "aqnnjcjemhdablsbxlah" > "${test_env_dir}/supabase/.temp/project-ref"'

echo "=========================================================="
echo "  Tests Finished: ${PASSED} Passed, ${FAILED} Failed"
echo "=========================================================="

if [ "${FAILED}" -gt 0 ]; then
  exit 1
fi
