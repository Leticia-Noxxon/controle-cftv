#!/bin/bash
# Recria o banco local "cftv_os" (Postgres puro + stub do Supabase), aplica todas as migrações e roda os testes SQL/Python.
set -e
cd "$(dirname "$0")/.."
sudo -u postgres dropdb --if-exists cftv_os
sudo -u postgres createdb cftv_os
P="sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d cftv_os"
$P -f tests/00_stub_supabase_local.sql
for f in migrations/*.sql; do echo "== $f"; $P -1 -f "$f"; done
