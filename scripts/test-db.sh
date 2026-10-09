#!/usr/bin/env bash
# Chạy migration trên một database Postgres tạm rồi kiểm tra luật phân quyền.
# Cần Postgres cục bộ (psql). Dùng: PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
DB="soviec_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do run -f "$f"; done
run -f supabase/tests/rules_test.sql
echo "Tất cả kiểm tra phân quyền đều đạt."
