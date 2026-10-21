#!/usr/bin/env bash
# Optional Linux/x86_64 fallback for the lightweight local PostgreSQL image.
# Hosted Supabase / the standard Supabase CLI already provide wal2json.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .local-stack/wal2json .local-stack/pginclude
curl -fL --retry 2 --max-time 60 https://github.com/eulerto/wal2json/archive/refs/tags/wal2json_2_6.tar.gz -o .local-stack/wal2json.tar.gz
printf '%s\n' '18b4bdec28c74a8fc98a11c72de38378a760327ef8e5e42e975b0029eb96ba0d  .local-stack/wal2json.tar.gz' | sha256sum --check --strict
tar -xzf .local-stack/wal2json.tar.gz -C .local-stack/wal2json --strip-components=1
docker cp crew-db:/usr/local/include/postgresql/. .local-stack/pginclude/
# The plugin resolves libc and PostgreSQL symbols in the server; do not link host glibc.
gcc -shared -nostdlib -fPIC -O2 -I.local-stack/pginclude/server -I.local-stack/pginclude/internal -I.local-stack/pginclude .local-stack/wal2json/wal2json.c -o .local-stack/wal2json/wal2json.so
chmod 644 .local-stack/wal2json/wal2json.so
docker cp .local-stack/wal2json/wal2json.so crew-db:/usr/local/lib/postgresql/wal2json.so
docker exec crew-db chmod 644 /usr/local/lib/postgresql/wal2json.so
docker exec crew-db psql -U postgres -v ON_ERROR_STOP=1 -c "alter system set output_plugin_libraries = 'pgoutput', 'test_decoding', 'wal2json';"
docker exec crew-db psql -U postgres -v ON_ERROR_STOP=1 -c 'select pg_reload_conf();'
# Demonstrate that the compiled artifact loads, rather than trusting a file's presence.
docker exec crew-db psql -U postgres -v ON_ERROR_STOP=1 -c "select * from pg_create_logical_replication_slot('crew_plugin_check','wal2json');select pg_drop_replication_slot('crew_plugin_check');"
