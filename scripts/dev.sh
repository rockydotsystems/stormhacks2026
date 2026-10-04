#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d node_modules ]]; then
  echo "Install dependencies with nix run .#install before starting development." >&2
  exit 1
fi

data_dir="$PWD/.direnv/postgres"
port="${STORMHACKS_DB_PORT:-5432}"

mkdir -p "$PWD/.direnv"
if [[ ! -f "$data_dir/PG_VERSION" ]]; then
  initdb -D "$data_dir" -U stormhacks --auth-local=trust \
    --auth-host=scram-sha-256 --pwfile=<(printf '%s\n' stormhacks)
fi

if ! pg_ctl -D "$data_dir" status >/dev/null 2>&1; then
  pg_ctl -D "$data_dir" -l "$data_dir/server.log" \
    -o "-h 127.0.0.1 -p $port -k ''" -w start
fi

export PGHOST=127.0.0.1 PGPORT="$port" PGUSER=stormhacks PGPASSWORD=stormhacks
if [[ "$(psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'stormhacks'")" != 1 ]]; then
  createdb stormhacks
fi

# Override migration credentials and the Worker binding together; never migrate the hosted database.
export DATABASE_URL="postgres://stormhacks:stormhacks@127.0.0.1:$port/stormhacks"
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$DATABASE_URL"
pnpm db:migrate
exec pnpm dev "$@"
