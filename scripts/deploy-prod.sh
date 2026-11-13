#!/usr/bin/env bash
# ==============================================================================
# SyncTone — One-Command Production Deployment & Bootstrap Script
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "================================================================="
echo "  SyncTone Production Deployment Initializer"
echo "================================================================="

# 1. Check prerequisites
if ! command -v docker &>/dev/null; then
  echo "✗ Error: Docker is not installed. Please install Docker Engine 24+."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "✗ Error: Docker Compose v2 is required."
  exit 1
fi

# 2. Check or initialize .env file
if [ ! -f ".env" ]; then
  echo "⚙ Generating .env from .env.example with random cryptographic secrets..."
  cp .env.example .env

  # Generate secure random secrets
  RANDOM_JWT=$(openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
  RANDOM_PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  RANDOM_MONGO_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

  # Replace placeholders
  sed -i.bak "s/replace_with_a_cryptographically_secure_random_jwt_secret_key_2026/${RANDOM_JWT}/g" .env
  sed -i.bak "s/replace_with_secure_postgres_password/${RANDOM_PG_PASS}/g" .env
  sed -i.bak "s/replace_with_secure_mongo_password/${RANDOM_MONGO_PASS}/g" .env
  rm -f .env.bak
  echo "✓ Created .env with unique production credentials."
else
  echo "✓ Found existing .env file."
fi

# 3. Pre-download ONNX neural TTS models (Kokoro-82M & Paradee-8M)
echo "📥 Checking & downloading neural TTS model weights..."
mkdir -p novel-audio-synthesizer/kokoro-tts-backend/models_cache
bash scripts/download-models.sh novel-audio-synthesizer/kokoro-tts-backend/models_cache

# 4. Build and start production stack
echo "🚀 Building and starting SyncTone production containers..."
docker compose -f docker-compose.prod.yml up -d --build

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
