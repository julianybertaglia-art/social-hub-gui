#!/usr/bin/env bash
# Two real PostgreSQL sessions, using the disposable CI container only.
set -euo pipefail
: "${DB_CONTAINER:?}"
db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d tide_store_test -X -A -t -v ON_ERROR_STOP=1 "$@"; }
org='11111111-1111-4111-8111-111111111111'
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

# The first transaction holds the row lock while the second tries to claim it.
# The extra test-only 30 second window makes scheduling jitter irrelevant.
db >"$temp/first" 2>&1 <<SQL &
BEGIN;
SET ROLE service_role;
SELECT 'CLAIM_READY_' || public.crm_vital_store_request_claim('$org')::text;
UPDATE public.crm_vital_store_request_limits SET next_request_at=clock_timestamp()+interval '30 seconds' WHERE organization_id='$org';
SELECT 'LOCK_HELD';
SELECT pg_sleep(2);
COMMIT;
SQL
first_pid=$!
for ((i=0;i<100;i++)); do
  if grep -q '^LOCK_HELD' "$temp/first"; then break; fi
  if ! kill -0 "$first_pid" 2>/dev/null; then cat "$temp/first" >&2; exit 1; fi
  sleep 0.1
done
grep -q '^LOCK_HELD' "$temp/first" || { cat "$temp/first" >&2; echo 'First session did not reach lock marker' >&2; exit 1; }
db >"$temp/second" 2>&1 <<SQL
SET ROLE service_role;
SELECT public.crm_vital_store_request_claim('$org');
SQL
wait "$first_pid"
grep -q '^CLAIM_READY_true$' "$temp/first" || { cat "$temp/first" >&2; exit 1; }
grep -q '^f$' "$temp/second" || { echo 'Concurrent claim was not blocked' >&2; cat "$temp/second" >&2; exit 1; }
echo 'PASS: simultaneous claims share the same protected limiter'
