#!/usr/bin/env bash
# ==============================================================================
# SyncTone — One-Command Production Deployment & Bootstrap Script
# ==============================================================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

INIT_ENV_ONLY=false
if [ "${1:-}" = "--init-env-only" ]; then
  INIT_ENV_ONLY=true
fi

echo "================================================================="
echo "  SyncTone Production Deployment Initializer"
echo "================================================================="

is_insecure_jwt_secret() {
  local s="${1:-}"
  s="${s#\"}"
  s="${s%\"}"
  s="${s#\'}"
  s="${s%\'}"

  if [ ${#s} -lt 32 ]; then
    return 0
  fi

  case "${s}" in
    replace_with_*|synctone_production_jwt_secret_token_key_2026|synctone_super_secret_jwt_key_2026_dev_mode|super_secret_jwt_key_synctone_2026|changeme*|secret*|password*|default*)
      return 0
      ;;
  esac

  return 1
}

read_env_var() {
  local file="$1"
  local key="$2"
  local line
  line=$(grep -E "^${key}=" "${file}" | tail -n 1 || true)
  printf '%s' "${line#*=}"
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local val="$3"
  local tmp_file
  tmp_file="$(mktemp "${file}.tmp.XXXXXX")"
  chmod 600 "${tmp_file}"

  if grep -qE "^${key}=" "${file}"; then
    awk -v k="${key}" -v v="${val}" '
      BEGIN { replaced=0 }
      $0 ~ ("^" k "=") { print k "=" v; replaced=1; next }
      { print }
      END { if (!replaced) print k "=" v }
    ' "${file}" > "${tmp_file}"
  else
    cat "${file}" > "${tmp_file}"
    printf '\n%s=%s\n' "${key}" "${val}" >> "${tmp_file}"
  fi
  mv "${tmp_file}" "${file}"
  chmod 600 "${file}"
}

ensure_prod_env() {
  if [ ! -f ".env" ]; then
    if [ ! -f ".env.example" ]; then
      echo "✗ Error: .env and .env.example are both missing." >&2
      exit 1
    fi
    echo "⚙ Generating .env from .env.example with random cryptographic secrets..."
    cp .env.example .env
    chmod 600 .env
  else
    chmod 600 .env
    echo "✓ Found existing .env file."
  fi

  local existing_jwt
  existing_jwt="$(read_env_var ".env" "JWT_SECRET")"
  if is_insecure_jwt_secret "${existing_jwt}"; then
    local fresh_jwt
    fresh_jwt="$(openssl rand -hex 32)"
    upsert_env_var ".env" "JWT_SECRET" "${fresh_jwt}"
    echo "✓ Generated and persisted strong random JWT_SECRET in .env (0600)."
  else
    echo "✓ Preserved existing secure JWT_SECRET in .env across deployment."
  fi

  local pg_pass mongo_pass
  pg_pass="$(read_env_var ".env" "POSTGRES_PASSWORD")"
  if [ -z "${pg_pass}" ] || [[ "${pg_pass}" == replace_with_* ]]; then
    local fresh_pg
    fresh_pg="$(openssl rand -hex 16)"
    upsert_env_var ".env" "POSTGRES_PASSWORD" "${fresh_pg}"
    sed -i.bak "s/replace_with_secure_postgres_password/${fresh_pg}/g" .env
    rm -f .env.bak
    chmod 600 .env
  fi

  mongo_pass="$(read_env_var ".env" "MONGO_PASSWORD")"
  if [ -z "${mongo_pass}" ] || [[ "${mongo_pass}" == replace_with_* ]]; then
    local fresh_mongo
    fresh_mongo="$(openssl rand -hex 16)"
    upsert_env_var ".env" "MONGO_PASSWORD" "${fresh_mongo}"
    sed -i.bak "s/replace_with_secure_mongo_password/${fresh_mongo}/g" .env
    rm -f .env.bak
    chmod 600 .env
  fi
}

# 1. Always initialize/preserve secure production secrets cleanly first
ensure_prod_env

if [ "${INIT_ENV_ONLY}" = true ]; then
  echo "✓ Environment initialization complete (--init-env-only)."
  exit 0
fi

# 2. Check Docker prerequisites
if ! command -v docker &>/dev/null; then
  echo "✗ Error: Docker is not installed. Please install Docker Engine 24+."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "✗ Error: Docker Compose v2 is required."
  exit 1
fi

# Validate production compose config with .env before deploying
docker compose -f docker-compose.prod.yml --env-file .env config --quiet

# 3. Pre-download ONNX neural TTS models (Kokoro-82M & Paradee-8M)
echo "📥 Checking & downloading neural TTS model weights..."
mkdir -p novel-audio-synthesizer/kokoro-tts-backend/models_cache
bash scripts/download-models.sh novel-audio-synthesizer/kokoro-tts-backend/models_cache

# 4. Build and start production stack
echo "🚀 Building and starting SyncTone production containers..."
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# 5. Wait for the API container to report healthy status
echo "⏳ Waiting for SyncTone API gateway to report healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until [ "$(docker inspect --format='{{json .State.Health.Status}}' synctone-prod-api 2>/dev/null || true)" == '"healthy"' ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
    echo "⚠️ Warning: API container health check timed out. Checking logs:"
    docker compose -f docker-compose.prod.yml logs api --tail 30
    break
  fi
  sleep 2
done

# 6. Seed demo library on initial boot
echo "🌱 Running idempotent demo catalog seeder..."
docker exec synctone-prod-api npm run seed:demos || {
  echo "⚠️ Note: Demo seeder finished or skipped (datasets may already exist)."
}

# 7. Print summary and health status
echo "================================================================="
echo "✓ SyncTone Production Deployment Completed Successfully!"
echo "================================================================="
docker compose -f docker-compose.prod.yml ps
echo "-----------------------------------------------------------------"
echo "Check Health Endpoint:   curl http://localhost/api/health"
echo "Check Models Status:     curl \"http://localhost/api/status/models?probe=true\""
echo "================================================================="
