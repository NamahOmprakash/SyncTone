# SyncTone — Production Infrastructure, Cloud VM Provisioning & Deployment Guide

This document provides the authoritative deployment specification, cloud provider evaluation, network security hardening, and operational runbook for running **SyncTone** in production.

---

## Table of Contents
1. [Cloud Provider Evaluation & VM Sizing Matrix](#1-cloud-provider-evaluation--vm-sizing-matrix)
2. [Production Architecture & Security Topology](#2-production-architecture--security-topology)
3. [Host OS Provisioning & Network Hardening](#3-host-os-provisioning--network-hardening)
4. [Step-by-Step Deployment Runbook](#4-step-by-step-deployment-runbook)
5. [Automated SSL/TLS Configuration](#5-automated-ssltls-configuration)
6. [ONNX Neural TTS Weights Management](#6-onnx-neural-tts-weights-management)
7. [Verification & Smoke Testing Checklist](#7-verification--smoke-testing-checklist)
8. [Day-2 Operations & Zero-Downtime Updates](#8-day-2-operations--zero-downtime-updates)

---

## 1. Cloud Provider Evaluation & VM Sizing Matrix

### Workload Profile Requirements
SyncTone runs a heterogeneous containerized stack:
- **Relational Core & ACID Task Broker**: PostgreSQL 16 (0.5–1 GB RAM)
- **Document Store for Timeline Manifests**: MongoDB 7.0 (1–2 GB RAM)
- **Distributed Object Storage**: OpenStack Swift / S3-compatible (0.5 GB RAM)
- **API Gateway & Audio Orchestrator**: Node.js 20 Debian Bookworm (0.5–1 GB RAM)
- **Neural Speech & NLP Worker**: Python 3.11 with ONNX Runtime (Kokoro-82M & Paradee-8M int8) (2–4 GB RAM under active synthesis)
- **Reverse Proxy & Web Server**: Nginx / Caddy 2.7 with HTTP Range streaming (100–250 MB RAM)
- **Optional Local LLM**: Ollama with Mistral / Llama 3 7B / 8B (requires 4–6 GB RAM)

**Target Spec**: **4 vCPU, 8–16 GB RAM, 50+ GB NVMe SSD, x86_64 architecture (AVX-512 / AVX2 instructions required for high-throughput ONNX CPU inference)**.

### Provider Comparison

| Provider | Recommended Instance | vCPU / RAM | Storage | Est. Monthly Cost | Strengths & Trade-offs | Rating |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Hetzner Cloud** *(Top Pick)* | **CPX31** (Shared) or **CCX23** (Dedicated) | 4 vCPU / 8 GB (CPX31) or 4 vCPU / 16 GB (CCX23) | 160–240 GB NVMe | **€14.50/mo** (~$16) or **€34.90/mo** (~$38) | • Unbeatable price-to-performance ratio<br>• AMD EPYC processors with full AVX-512 support for ONNX Runtime<br>• Fast local NVMe storage included<br>• 20 TB free monthly egress<br>• Datacenters in EU (Falkenstein, Nuremberg, Helsinki) & US (Ashburn, VA; Hillsboro, OR) | **5/5 (Best Value)** |
| **DigitalOcean** | **Basic Droplet (Premium AMD)** or **CPU-Optimized** | 4 vCPU / 8 GB or 4 vCPU / 16 GB | 160 GB NVMe | **$48/mo** or **$84/mo** | • Clean dashboard and straightforward firewall management<br>• High single-core turbo clock<br>• 5 TB egress included<br>• Available in 9 global regions | **4.2/5** |
| **Google Cloud (GCP)** | **e2-standard-4** or **c2-standard-4** | 4 vCPU / 16 GB | 100 GB Balanced PD | **~$120–$145/mo** | • Enterprise 99.99% SLA<br>• Seamless VPC integration with Google Cloud Storage and Gemini API<br>• E2 instances use dynamic vCPU scheduling; C2 provides dedicated compute-optimized cores<br>• Premium egress pricing (~$0.08–$0.12/GB) | **4/5 (Enterprise Choice)** |
| **AWS (Amazon Web Services)** | **c6i.xlarge** or **t3.xlarge** | 4 vCPU / 8 GB (c6i) or 4 vCPU / 16 GB (t3) | 100 GB gp3 EBS | **~$125–$140/mo** | • Intel Xeon Ice Lake with AVX-512 (ideal for ONNX CPU inference)<br>• Global infrastructure footprint<br>• Burst credits on t3 can throttle during long audiobook batch syntheses; c6i is recommended over t3 | **3.9/5** |

### Final Recommendation:
1. **Primary Recommendation**: **Hetzner CPX31 (4 vCPU, 8 GB RAM, 160 GB NVMe)** for production staging or cost-efficient production, or **Hetzner CCX23 (4 Dedicated vCPU, 16 GB RAM)** if running local Ollama sidecars alongside the ONNX synthesis queue.
2. **Enterprise Cloud Alternative**: **GCP Compute Engine e2-standard-4** in `us-central1` or `europe-west3` if multi-cloud corporate compliance or Google Cloud Storage peering is mandated.

---

## 2. Production Architecture & Security Topology

```
                         [ Public Internet ]
                                  │
                                  │ Ports 80 & 443 (HTTP/3, HTTPS)
                                  ▼
                   ┌──────────────────────────────┐
                   │    Caddy / Nginx Gateway     │
                   │  - Auto Let's Encrypt TLS    │
                   │  - client_max_body_size 350M │
                   │  - proxy_buffering off       │
                   │  - proxy_force_ranges on     │
                   └──────────────┬───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │ Internal Docker Network   │
                    │      (synctone-net)       │
                    └─────────────┬─────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
       ▼                          ▼                          ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   frontend   │          │     api      │          │    worker    │
│  React+Vite  │          │ Node 20 API  │          │ Python 3.11  │
│  Port 80     │          │  Port 4000   │          │ Kokoro/ONNX  │
└──────────────┘          └───────┬──────┘          └───────┬──────┘
                                  │                         │
                                  └───────────┬─────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │  postgres   │           │    mongo    │           │    swift    │
             │ Postgres 16 │           │  MongoDB 7  │           │ Object Store│
             │ (127.0.0.1) │           │ (127.0.0.1) │           │ (127.0.0.1) │
             └─────────────┘           └─────────────┘           └─────────────┘
```

### Port Exposure & Firewall Matrix

| Port | Service | Bound Interface | Public Access | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **22** | OpenSSH | `0.0.0.0:22` | **Allowed (Key Only)** | Server administration via SSH ed25519 keys |
| **80** | HTTP | `0.0.0.0:80` | **Allowed** | ACME Let's Encrypt HTTP-01 challenge & automatic HTTPS redirection |
| **443** | HTTPS | `0.0.0.0:443` | **Allowed** | Production TLS encrypted web app, audio streaming & API traffic |
| **4000** | Express API | `127.0.0.1:4000` | **BLOCKED** | Internal to Docker network; reverse-proxied via `/api/` |
| **5432** | PostgreSQL 16 | `127.0.0.1:5432` | **BLOCKED** | Authoritative relational store; accessible only locally on host or via container network |
| **27017** | MongoDB 7.0 | `127.0.0.1:27017` | **BLOCKED** | Document store; accessible only locally on host or via container network |
| **8080** | Swift / Storage | `127.0.0.1:8080` | **BLOCKED** | Internal object storage; accessed exclusively via API streaming proxy |

> [!IMPORTANT]
> **Docker iptables Bypass Warning**: Standard Docker port mappings (`-p 5432:5432`) insert `DOCKER` iptables chains that bypass host UFW rules. SyncTone's `docker-compose.yml` and `docker-compose.prod.yml` explicitly bind database ports to `127.0.0.1` (`127.0.0.1:5432:5432`, `127.0.0.1:27017:27017`, `127.0.0.1:8080:8080`). This guarantees internal services can never be reached over the public internet, even if the host firewall is disabled.

---

## 3. Host OS Provisioning & Network Hardening

### Recommended Host OS: **Ubuntu 24.04 LTS (x86_64)** or **Ubuntu 22.04 LTS (x86_64)**

### 3.1 Initial Server Hardening & UFW Configuration
Connect to the clean VM via SSH and execute:

```bash
# Update base system packages
sudo apt update && sudo apt upgrade -y

# Configure Uncomplicated Firewall (UFW)
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow ONLY SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP ACME'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 443/udp comment 'HTTP3 QUIC'

# Enable firewall
sudo ufw --force enable
sudo ufw status verbose
```

### 3.2 Install Docker Engine 24+ & Docker Compose v2
```bash
# Remove obsolete packages
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install official Docker repository GPG key
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker apt repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker CE and Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker service
sudo systemctl enable --now docker

# Optional: Add current user to docker group (avoids needing sudo for docker commands)
sudo usermod -aG docker "$USER"
newgrp docker
```

### 3.3 Kernel & Resource Limit Tuning
Edit `/etc/sysctl.d/99-synctone.conf`:
```ini
# Optimize virtual memory for MongoDB and Python ONNX worker
vm.max_map_count=262144
vm.swappiness=10
net.core.somaxconn=1024
fs.file-max=2097152
```
Apply immediately:
```bash
sudo sysctl --system
```

---

## 4. Step-by-Step Deployment Runbook

### Option A: One-Command Automated Deployment (Recommended)
SyncTone includes an automated production bootstrapper script:

```bash
# 1. Clone repository
git clone https://github.com/NamahOmprakash/SyncTone.git synctone
cd synctone

# 2. Run one-command production bootstrapper
bash scripts/deploy-prod.sh
```

The bootstrapper automatically:
1. Validates Docker and Docker Compose prerequisites.
2. Initializes `.env` with cryptographically secure random passwords for PostgreSQL, MongoDB, and JWT signing.
3. Downloads the Kokoro-82M and Paradee-8M neural ONNX models into `models_cache`.
4. Builds and starts all production containers with health checks.
5. Seeds the demo portfolio (`Harry Potter`, `Sherlock Holmes`, 20 voice profiles).

---

### Option B: Manual Step-by-Step Deployment

#### Step 1: Clone Repository
```bash
git clone https://github.com/NamahOmprakash/SyncTone.git synctone
cd synctone
```

#### Step 2: Configure Production `.env`
```bash
cp .env.example .env
```
Generate random secrets:
```bash
# Generate unique secrets
RANDOM_JWT=$(openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
RANDOM_PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
RANDOM_MONGO_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

# Apply into .env
sed -i "s/replace_with_a_cryptographically_secure_random_jwt_secret_key_2026/${RANDOM_JWT}/g" .env
sed -i "s/replace_with_secure_postgres_password/${RANDOM_PG_PASS}/g" .env
sed -i "s/replace_with_secure_mongo_password/${RANDOM_MONGO_PASS}/g" .env
```

If you own a domain (e.g., `synctone.example.com`), update `DOMAIN_NAME`:
```bash
sed -i "s/DOMAIN_NAME=localhost/DOMAIN_NAME=synctone.example.com/g" .env
```
*(Or for testing with your VM public IP, you can use `nip.io`: `DOMAIN_NAME=<YOUR_VM_IP>.nip.io`)*.

#### Step 3: Pre-download Neural TTS Model Weights
```bash
bash scripts/download-models.sh novel-audio-synthesizer/kokoro-tts-backend/models_cache
```

#### Step 4: Build & Launch Production Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

#### Step 5: Verify Healthy Status
```bash
docker compose -f docker-compose.prod.yml ps
```
All containers (`synctone-prod-postgres`, `synctone-prod-mongo`, `synctone-prod-swift`, `synctone-prod-api`, `synctone-prod-worker`, `synctone-prod-frontend`, `synctone-prod-caddy`) should display `Up (healthy)`.

#### Step 6: Seed Reference Demos
```bash
docker exec synctone-prod-api npm run seed:demos
```

---

## 5. Automated SSL/TLS Configuration

SyncTone includes an integrated **Caddy 2.7** reverse proxy configured in `docker-compose.prod.yml` and `docker/caddy/Caddyfile`:

- **Automatic TLS**: When `DOMAIN_NAME` is configured to a valid public domain name pointing to the VM IP, Caddy automatically provisions and renews TLS certificates via Let's Encrypt or ZeroSSL without requiring Certbot cron jobs.
- **Testing via IP**: If you don't have a domain name yet, point `DOMAIN_NAME=<YOUR_IP>.nip.io` in `.env`. Let's Encrypt will issue a valid, browser-trusted SSL certificate for the IP hostname!
- **Fallback / Local Dev**: If `DOMAIN_NAME=localhost`, Caddy generates an internal trusted development certificate or serves standard HTTP on port 80.

---

## 6. ONNX Neural TTS Weights Management

The Node API and Python worker share neural voice models via the Docker named volume `models_cache`, mounted at:
- `/app/kokoro-tts-backend/models_cache`
- `/app/models_cache`

### Model Files:
1. **Kokoro-82M v1.0**:
   - `kokoro-v1.0.onnx` (~330 MB)
   - `voices-v1.0.bin` (~21 MB)
   - Symlinks: `kokoro-v0_19.onnx -> kokoro-v1.0.onnx`, `voices.bin -> voices-v1.0.bin` (ensures 100% backward compatibility)
2. **Paradee-8M-v1.2** (`sahilmahendrakar/Paradee-8M-v1.2`):
   - `paradee-v1.2-int8.onnx` (~8.5 MB int8 quantized ONNX weights)
   - `paradee-voices.json` / `voices.json` (vector voice metadata)

The script `scripts/download-models.sh` is completely idempotent. It verifies file presence and minimum file sizes before downloading, skipping files that already exist on disk.

---

## 7. Verification & Smoke Testing Checklist

Run these commands from the VM host or any client to verify complete production readiness:

### 1. API Health Check
```bash
curl -f http://localhost/api/health
```
**Expected Response:**
```json
{"status":"healthy","version":"0.1.0"}
```

### 2. Model & TTS Engine Readiness
```bash
curl -s "http://localhost/api/status/models?probe=true" | jq
```
**Expected Response:**
```json
{
  "tts": {
    "primary_engine": "msedge-tts (Cloud Neural)",
    "fallback_engine": "kokoro-tts (Local ONNX)",
    "machine_engine": "machine-tts (Local OS Speech)",
    "engines": ["msedge-tts", "kokoro-tts", "machine-tts"],
    "cloud_ready": true,
    "model_exists": true,
    "voices_exists": true,
    "initialized": true
  },
  "llm": {
    "available": false,
    "model": "mistral",
    "url": "http://localhost:11434"
  }
}
```

### 3. HTTP Range Audio Scrubbing Verification
```bash
# Probe audio streaming endpoint with HTTP Range header
curl -i -r 0-1024 http://localhost/api/stream/test_probe
```
**Expected Response:**
- Returns `HTTP/1.1 206 Partial Content` (or `200 OK` / clean response with `Accept-Ranges: bytes` header).
- Nginx / Caddy passes through without buffering (`X-Accel-Buffering: no`).

### 4. 350 MB Book File Upload Test
Upload a test high-capacity book file:
```bash
curl -X POST -F "file=@test_book.epub" http://localhost/api/novels/upload
```
**Expected Response:**
- Returns `200 OK` with JSON book metadata (no `413 Request Entity Too Large`).

---

## 8. Day-2 Operations & Zero-Downtime Updates

### Redeploy / Update Stack
To pull new application changes from git and rebuild without interrupting persistent database volumes:

```bash
cd synctone
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

### View Live Container Logs
```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f --tail 50

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker
```

### Database Backups

#### PostgreSQL 16 Backup:
```bash
docker exec synctone-prod-postgres pg_dump -U synctone_user synctone > "synctone_pg_$(date +%Y%m%d).sql"
```

#### MongoDB 7.0 Backup:
```bash
docker exec synctone-prod-mongo mongodump --out /data/db/backup_$(date +%Y%m%d)
```

#### Shared Audio & Covers Backup:
```bash
tar -czvf "synctone_audio_covers_$(date +%Y%m%d).tar.gz" novel-audio-synthesizer/output/
```

---

## Summary of Deliverables & Infrastructure Changes

| Component | File Changed / Created | Summary of Fix |
| :--- | :--- | :--- |
| **Backend Dockerfile** | `novel-audio-synthesizer/backend/Dockerfile` | Switched from `node:20-alpine` to `node:20-bookworm-slim` (glibc); installed `python3`, `python3-pip`, `python3-venv`, `ffmpeg`, `espeak-ng`, `curl`; installed `pypdf`, `pypdfium2`, `onnxruntime`, `kokoro-onnx`, `soundfile`, `numpy`; configured `/opt/venv` and `ENV PYTHON_BIN`. |
| **Worker Dockerfile** | `novel-audio-synthesizer/kokoro-tts-backend/Dockerfile` | Added `espeak-ng` phonemizer; pinned `soundfile` and `onnxruntime` in `requirements.txt`. |
| **Nginx Reverse Proxy** | `novel-audio-synthesizer/frontend/nginx.conf` | Added `client_max_body_size 350M;`; created dedicated `/api/stream/` block with `proxy_buffering off;` and `proxy_force_ranges on;` for scrubbing. |
| **Model Weights Script** | `scripts/download-models.sh` | Idempotent downloader for Kokoro-82M v1.0, voices-v1.0.bin, Paradee-8M-v1.2 int8 ONNX (8.5 MB), voices.json, and backward-compatible symlinks. |
| **Development Compose** | `docker-compose.yml` | Bound Postgres, Mongo, Swift, and API ports strictly to `127.0.0.1`; added shared persistent `models_cache`, `shared_output`, `covers_data`, and `chapters_data` volumes. |
| **Production Compose** | `docker-compose.prod.yml` | Full production stack with automated Let's Encrypt HTTPS via Caddy 2.7, model-init container, health checks, and demo seeder. |
| **Caddy HTTPS Proxy** | `docker/caddy/Caddyfile` | Automated SSL termination, 350 MB upload limits, HTTP Range streaming reverse proxy, and security headers. |
| **Environment Template** | `.env.example` | Comprehensive production-ready template with secrets documentation, domain configuration, and model paths. |
| **Deployment Automator** | `scripts/deploy-prod.sh` | One-command production deployment script that provisions secrets, downloads models, starts containers, and seeds demos. |
| **Documentation** | `DEPLOY.md` | Full cloud provider evaluation, VM sizing, UFW firewall configuration, and operational runbook. |
