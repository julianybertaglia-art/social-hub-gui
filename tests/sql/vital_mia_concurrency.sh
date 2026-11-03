#!/usr/bin/env bash
# Real, simultaneous sessions against a disposable Postgres; no hosted credentials.
set -euo pipefail
: "$DB_CONTAINER"
db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d tide_crm_smoke -X -A -t -v ON_ERROR_STOP=1 "$@"; }
org="$(db -c "select id from public.crm_organizations where workspace_code='vital-decor'")"
conn="$(db -c "select id from public.workspace_meta_connections where workspace_id='vital-decor' and platform='whatsapp' and state='connected' limit 1")"
owner='00000000-0000-4000-8000-000000000001'
agent='00000000-0000-4000-8000-000000000005'
phone='5511000000111'
if [[ ! "$org" =~ ^[0-9a-f-]{36}$ || ! "$conn" =~ ^[0-9a-f-]{36}$ ]]; then
 echo 'Invalid disposable test fixture IDs' >&2; exit 1
fi
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
await_marker() {
 local logfile="$1" marker="$2"
 for ((i=0;i<100;i++)); do
  if grep -q "^$marker" "$logfile"; then return 0; fi
  sleep 0.10
 done
 echo "First session did not reach marker: $marker" >&2
 cat "$logfile" >&2; exit 1
}

# 1. Rate limit is atomic across independent Postgres transactions.
db >"$temp/quota-first" 2>&1 <<SQL &
BEGIN;
SET ROLE service_role;
SELECT 'QUOTA_READY_' || public.crm_vital_mia_claim_request_atomic('$org','$agent',1)::text;
SELECT pg_sleep(3);
COMMIT;
SQL
pid=$!
await_marker "$temp/quota-first" 'QUOTA_READY_true'
db >"$temp/quota-second" 2>&1 <<SQL
SET ROLE service_role;
SELECT public.crm_vital_mia_claim_request_atomic('$org','$agent',1);
SQL
wait "$pid"
grep -q '^f$' "$temp/quota-second" || { echo 'Concurrent MIA quota bypass' >&2; cat "$temp/quota-second" >&2; exit 1; }
quota_count="$(db -c "select count(*) from public.crm_vital_mia_request_log where organization_id='$org' and user_id='$agent' and created_at>now()-interval '1 hour'")"
[[ "$quota_count" == "1" ]] || { echo "Incorrect quota count: $quota_count" >&2; exit 1; }
echo 'PASS: simultaneous MIA requests allow exactly one claim under limit 1'

# 2. Two human replies cannot reserve the same fictitious conversation.
db >"$temp/reply-first" 2>&1 <<SQL &
BEGIN;
SET ROLE service_role;
SELECT 'LEASE_READY_' || public.crm_vital_claim_reply_atomic('$org','$conn','$owner','$phone','pos_shopee','$owner')::text;
SELECT pg_sleep(3);
COMMIT;
SQL
pid=$!
await_marker "$temp/reply-first" 'LEASE_READY_'
db >"$temp/reply-second" 2>&1 <<SQL
SET ROLE service_role;
DO \$test\$
BEGIN
 PERFORM public.crm_vital_claim_reply_atomic('$org','$conn','$owner','$phone','pos_shopee','$owner');
 RAISE EXCEPTION 'Second reply claim unexpectedly succeeded';
EXCEPTION WHEN sqlstate '55P03' THEN
 RAISE NOTICE 'EXPECTED_LEASE_COLLISION';
END
\$test\$;
SQL
wait "$pid"
grep -q 'EXPECTED_LEASE_COLLISION' "$temp/reply-second" || { echo 'Concurrent reply lease bypass' >&2; cat "$temp/reply-second" >&2; exit 1; }
lease_count="$(db -c "select count(*) from public.crm_vital_reply_locks where organization_id='$org' and connection_id='$conn' and contact_wa_id='$phone'")"
[[ "$lease_count" == "1" ]] || { echo "Expected one reply lease, got $lease_count" >&2; exit 1; }
release="$(db <<SQL
SET ROLE service_role;
SELECT public.crm_vital_release_reply_atomic(
 '$org','$conn','$phone','$owner',
 (SELECT lease_id FROM public.crm_vital_reply_locks
   WHERE organization_id='$org' AND connection_id='$conn' AND contact_wa_id='$phone')
);
SQL
)"
grep -q '^t$' <<<"$release" || { echo 'Failed to release fake lease' >&2; exit 1; }
echo 'PASS: simultaneous WhatsApp replies yield one lease and one 55P03 collision'
