#!/usr/bin/env bash
# Two sessions against the disposable CI database; no live messages or keys.
set -euo pipefail
: "${DB_CONTAINER:?}"
db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d tide_argo_qa -X -A -t -v ON_ERROR_STOP=1 "$@"; }
owner='00000000-0000-4000-8000-000000000001'
org="$(db -c "select id from public.crm_organizations where workspace_code='vital-decor' and owner_user_id='$owner'")"
conn="$(db -c "select id from public.workspace_meta_connections where workspace_id='vital-decor' and owner_user_id='$owner' and platform='whatsapp'")"
[[ "$org" =~ ^[0-9a-f-]{36}$ && "$conn" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Invalid fake scope' >&2; exit 1; }
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
db >"$temp/first" 2>&1 <<SQL &
BEGIN;
SET ROLE service_role;
SELECT 'TRANSFER_READY_' || public.crm_vital_transfer_argo_atomic(
 '$org','$conn','$owner','5511000000005','pos_ml','pos_shopee',null,'$owner',
 'andrey','2026-01-01T00:00:00Z','tide','open','pos_venda','Pós-venda · Shopee','2026-01-01T00:00:00Z')::text;
SELECT pg_sleep(2);
COMMIT;
SQL
pid=$!
for ((i=0;i<100;i++)); do
 if grep -q '^TRANSFER_READY_' "$temp/first"; then break; fi
 sleep 0.1
done
grep -q '^TRANSFER_READY_' "$temp/first" || { echo 'First transaction did not reach barrier' >&2; exit 1; }
db >"$temp/second" 2>&1 <<SQL
SET ROLE service_role;
DO \$test\$
BEGIN
 PERFORM public.crm_vital_transfer_argo_atomic(
 '$org','$conn','$owner','5511000000005','pos_ml','pos_shopee',null,'$owner',
 'andrey','2026-01-01T00:00:00Z','tide','open','pos_venda','Pós-venda · Shopee','2026-01-01T00:00:00Z');
 RAISE EXCEPTION 'Second stale transfer unexpectedly succeeded';
EXCEPTION WHEN serialization_failure THEN
 RAISE NOTICE 'EXPECTED_STALE_TRANSFER';
END
\$test\$;
SQL
wait "$pid"
grep -q 'EXPECTED_STALE_TRANSFER' "$temp/second" || { echo 'Concurrent stale transfer was not rejected' >&2; exit 1; }
count="$(db -c "select count(*) from public.crm_vital_transfer_audit where organization_id='$org' and contact_wa_id='5511000000005'")"
[[ "$count" == '1' ]] || { echo "Expected one audit, got $count" >&2; exit 1; }
echo 'PASS: simultaneous transfers produced one update and one stale-state rejection'
