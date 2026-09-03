#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
UPDATE=false

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/deploy-single.sh [--update]"
  echo "  --update  fetch and deploy the latest merged main branch"
  exit 0
elif [[ "${1:-}" == "--update" ]]; then
  UPDATE=true
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: bash scripts/deploy-single.sh [--update]" >&2
  exit 2
fi

cd "$ROOT_DIR"

for command in docker git; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it on the server; never commit it." >&2
  exit 1
fi

required_keys=(
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
  SESSION_SECRET PASSWORD_PEPPER INTERNAL_API_SECRET
  RATE_LIMIT_PROXY_SECRET CORS_ORIGIN NEXT_PUBLIC_WS_URL
  USER_SESSION_SECRET ADMIN_USERNAME ADMIN_PASSWORD ADMIN_SESSION_SECRET
)
for key in "${required_keys[@]}"; do
  if ! grep -Eq "^[[:space:]]*${key}=" "$ENV_FILE"; then
    echo "$ENV_FILE is missing $key" >&2
    exit 1
  fi
done

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if [[ "$UPDATE" == true ]]; then
  git fetch origin main
  git switch main
  git pull --ff-only origin main
fi

"${compose[@]}" config --quiet
"${compose[@]}" up -d --build
# Re-resolve Docker DNS after api/web recreation so Nginx does not keep stale IPs.
"${compose[@]}" up -d --force-recreate nginx
"${compose[@]}" ps

health_ok=false
for _ in {1..30}; do
  if "${compose[@]}" exec -T api node -e \
    "fetch('http://127.0.0.1:3001/health').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"; then
    health_ok=true
    break
  fi
  sleep 2
done

if [[ "$health_ok" != true ]]; then
  echo "API health check failed; recent logs:" >&2
  "${compose[@]}" logs --tail=80 api nginx >&2 || true
  exit 1
fi

"${compose[@]}" exec -T nginx nginx -t
echo "Single-server deployment is healthy."
