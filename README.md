<div align="center">

# 🎙️ SyncTone
### Automated Multi-Voice Audiobook Synthesis & Synchronized Web Reader

[![License: Non-Commercial](https://img.shields.io/badge/License-Non--Commercial-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-blue.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248.svg)](https://www.mongodb.com/)
[![OpenStack Swift](https://img.shields.io/badge/Storage-OpenStack%20Swift-EB1B24.svg)](https://wiki.openstack.org/wiki/Swift)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB.svg)](https://react.dev/)

*An intelligent, multi-character digital library and neural audiobook synthesis platform that parses literary novels, extracts grounded character personas, synthesizes distinct neural character voices, and delivers synchronized text-audio reading.*

</div>

---

## 📖 Executive Summary & Motivation

Traditional digital audiobooks rely on single-narrator voice acting, which flattens multi-character dialogue into monotonous narration and lacks visual synchronization. Modern web novel readers (e.g., WTR-Lab, Webnovel) offer extensive text libraries but lack expressive, automated voice immersion. 

**SyncTone** addresses this with an end-to-end audiobook generation pipeline paired with an interactive web reader. When a novel or chapter is ingested, SyncTone optionally strips web scraping artifacts using the client-side [`tts-dom-cleaner`](https://www.npmjs.com/package/tts-dom-cleaner) engine. The system analyzes character interactions using deterministic grammatical dependency parsing combined with a grounded Character Profiler that enforces regex substring checks and pronoun validation.

Dialogue and narration segments are synthesized across multiple TTS engines (**Edge Neural TTS**, **Kokoro-ONNX**, optional **Paradee-8M**, and local OS speech), stitched into aligned audio with timeline manifests, and streamed via **OpenStack Swift** / S3 / MongoDB GridFS / local HTTP range endpoints. In the frontend, `requestAnimationFrame` audio clock polling highlights sentences and words in sync during playback.

*(Note: Dynamic voice ageing across timeline eras is not implemented and remains an unimplemented future concept.)*

---

## ✨ Core Features

- 🎭 **Automated Multi-Voice Synthesis**: Distinct neural voices assigned dynamically to dialogue lines and narrators based on character gender, age, and archetype.
- 🛡️ **Zero-Hallucination Character Profiling**: Grounded candidate extraction combining SpaCy/heuristic parsing, whole-novel context analysis, and strict substring/pronoun grounding.
- 🎯 **Verbatim Recounted Dialogue Switching**: Voice switches when narrators quote or recount dialogue without modifying the original text.
- ⚡ **Synchronized Read-Along Highlighting**: Continuous `requestAnimationFrame` audio clock polling for synchronized sentence/word tracking.
- 📦 **Polyglot Database Architecture**: 
  - **PostgreSQL 16**: Relational core for users, auth (RBAC), novel metadata, character portfolios, and `FOR UPDATE SKIP LOCKED` task queues.
  - **MongoDB 7**: High-throughput document store for raw chapter texts, segmented dialogue arrays, and read-optimized timeline manifests.
  - **OpenStack Swift**: Distributed object storage for final `.opus` audio and novel cover art, accessed via an authenticated Express token proxy.
- 👥 **Role-Based Access Control (RBAC)**: Fine-grained permissions for **Readers** (browse, listen, bookmark), **Authors** (create novels, submit chapters), and **Admins** (moderation, catalog verification).
- 📚 **Verified vs. Community Channels**: Dedicated catalog sections for verified classics and user-submitted community web novels.
- 🧹 **Client-Side DOM Sanitization**: Pre-ingestion cleaning using `tts-dom-cleaner` to strip web ads, author notes, and ruby annotations.

---

## 🏗️ Polyglot Architecture & Data Flow

SyncTone separates concerns across a high-concurrency API gateway, dedicated document/relational databases, an object storage cluster, and a decoupled CPU-efficient neural synthesis daemon.

```
┌────────────────────────────────────────────────────────────────────────┐
│                             USER BROWSER                               │
│  React 18 + Vite SPA | tts-dom-cleaner | 60fps requestAnimationFrame   │
└───────────────────▲────────────────────────────────┬───────────────────┘
                    │ Audio Stream (Range: bytes)    │ REST / Chapter Upload
                    │ SSE Progress Events            │ 
┌───────────────────┴────────────────────────────────▼───────────────────┐
│                     EXPRESS.JS API GATEWAY (Node.js/TS)                │
│  - JWT Auth & RBAC (Reader / Author / Admin)                           │
│  - Swift Streaming Proxy (Token Refresh & 206 Partial Content)         │
│  - SSE Synthesis Progress Broadcasts                                   │
└───────────────▲─────────────────────▲─────────────────────▲────────────┘
                │                     │                     │
                ▼                     ▼                     ▼
      ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
      │  PostgreSQL 16   │  │    MongoDB 7     │  │ OpenStack Swift  │
      │  - Users & Roles │  │  - Raw Chapters  │  │  - Final .opus   │
      │  - Characters    │  │  - Segments []   │  │  - Novel Covers  │
      │  - Task Queue    │  │  - Manifests     │  │  - Multi-tenant  │
      └────────▲─────────┘  └────────▲─────────┘  └────────▲─────────┘
               │ Claim Task          │ Read/Write          │ Upload
               │ (SKIP LOCKED)       │ Segments            │ .opus
┌──────────────┴─────────────────────┴─────────────────────┴────────────┐
│                    PYTHON TTS WORKER DAEMON (Python 3.11)              │
│  - SpaCy NER & Grounded Character Profiler (No Hallucinations)         │
│  - Grammatical Dependency Speaker Attribution                          │
│  - Kokoro-ONNX Neural TTS (82M params, CPU-optimized)                  │
│  - Zero-Drift Sample Accumulator & FFmpeg Single-Pass Opus Stitcher    │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Storage Justification
| Storage Engine | Stored Entities | Justification |
|---|---|---|
| **PostgreSQL 16** | Users, RBAC, Novels, Characters, Aliases, Jobs Queue, Playback State | Enforces relational constraints (unique usernames, character ownership, narrator uniqueness), ACID transactions, and atomic job claims via `FOR UPDATE SKIP LOCKED`. |
| **MongoDB 7** | Chapter raw text, Segment arrays (text, timing, voice key), Timeline Manifests | Stores large, variable-length text corpora and nested segment timelines without relational joins; provides rapid sub-millisecond document retrieval for reader clients. |
| **OpenStack Swift** | Final stitched `.opus` audio objects, Novel cover images | Distributed, scalable object storage with multi-tenant isolation, eliminating local disk dependencies and supporting HTTP `Range` streaming. |

---

## 📂 Project Directory Structure

```text
Multi-voice-synthesizer/
├── LICENSE                        # SyncTone Non-Commercial Source-Available License
├── README.md                      # Comprehensive project documentation
├── .gitignore                     # Production Git ignore rules
│
├── novel-audio-synthesizer/       # Core Application Stack
│   ├── backend/                   # Python TTS Worker & NLP Engine
│   │   ├── app/                   # Worker daemon, NLP attribution, Kokoro pipeline
│   │   ├── tests/                 # Unit & integration tests
│   │   └── requirements.txt       # Python dependencies (spaCy, kokoro-onnx, etc.)
│   │
│   ├── frontend/                  # React 18 + Vite + Tailwind CSS SPA
│   │   ├── src/                   # Reader UI, 60fps audio synchronization hooks
│   │   ├── package.json           # Frontend dependencies
│   │   └── vite.config.ts         # Vite build configuration
│   │
│   └── api/                       # Express.js (TypeScript) Backend API [In Progress]
│       ├── src/controllers/       # Auth, Novel, Chapter, Playback controllers
│       ├── src/services/          # Swift proxy, Postgres queue, Mongo models
│       └── package.json           # Express dependencies
│
└── scratch/                       # Test suites & verification scripts
    └── verify/
        ├── test_grounding.py      # Grounded character extraction verification
        └── test_audio_and_swift.py# Sample clock drift & Swift proxy tests
```

---

## 👥 2-Person Team Workload Division

This project is engineered as a collaborative 2-person effort with clear separation of ownership:

### 👤 Project Initiator & Audio/NLP Lead (Namah Omprakash)
- **Novel Analysis & Parsing**: Heuristic/LLM/OCR chapter parsing, quote extraction regex, SpaCy dependency attribution, and dialogue turn reconstruction.
- **Character Detection & Voice Casting**: Grounded character extraction (`attribution`, `voiceProfiler`), character-to-voice mapping, and `/api/voices/assign` cast customization.
- **Text-to-Speech Implementation**: Multi-engine TTS architecture (Edge Neural TTS, Kokoro-ONNX, Paradee-8M, OS machine fallback), audio stitching, and cloud object storage integration.

### 👤 Co-Contributor & Platform/Frontend Lead (Mohd Faizan Khan)
- **Transactional Novel & Chapter Ingestion**: Atomic PostgreSQL + MongoDB multi-store ingestion transactions (`POST /api/novels`, `POST /api/novels/:id/chapters`, `POST /api/upload`), row-level `FOR UPDATE` numbering serialization, and compensating rollback safety.
- **Fourth Normal Form (4NF) Database Migrations**: PostgreSQL 16 strict 3NF/4NF schema normalization, subtype target integrity triggers (`synthesis_jobs`, `character_aliases`, `playback_positions`), and Alembic migrations.
- **Authentication & RBAC Implementation**: JWT httpOnly cookie authentication, password hashing, passkey/OAuth flows, and role/ownership enforcement (`Reader` / `Writer` / `Admin`).
- **Reader-Facing Frontend Development**: React 18 SPA, library catalog (Verified vs. Community), chapter reader modes, playback progress/audio synchronization UI, and upload workflows.
- **Future Scope (Unimplemented)**: Dynamic voice ageing across timeline eras is **not implemented** and remains a conceptual future enhancement only.

---

## 🚀 Fast-Track 20-Day Roadmap

| Sprint Phase | Timeline | Core Deliverables | Ownership |
|---|---|---|---|
| **Phase 1: Foundation & Schemas** | **Days 1 – 7** | PostgreSQL DDL & migrations; MongoDB schemas; Swift container setup; SpaCy & Kokoro worker scaffold; Docker Compose multi-service orchestrator. | Partner (API/DB) & Owner (Worker/Audio) |
| **Phase 2: Core Pipeline & Streaming** | **Days 8 – 14** | Grounded character profiling; dialogue attribution; Kokoro multi-voice batch synthesis; sample-accurate audio stitching; Swift proxy with Range streaming. | Owner (Audio/NLP) & Partner (Swift/Proxy) |
| **Phase 3: Reader UI & Verification** | **Days 15 – 20** | React 60fps synchronized reader; Verified/Community catalog; character voice override UI; end-to-end integration with demo novels (Harry Potter & web novels). | Partner (UI) & Owner (End-to-End Tests) |

---

## 🛠️ Quickstart & Local Setup

### Prerequisites
- **Node.js** v20+ and **npm**
- **Python** 3.11+
- **Docker** & **Docker Compose**
- **FFmpeg** installed and accessible in `$PATH`

### 1. Clone the Repository
```bash
git clone https://github.com/NamahOmprakash/Multi-voice-synthesizer.git
cd Multi-voice-synthesizer
```

### 2. Environment Configuration
Create a `.env` file in the project root:
```ini
# PostgreSQL
DATABASE_URL=postgresql://synctone_user:synctone_pass@localhost:5432/synctone

# MongoDB
MONGO_URI=mongodb://localhost:27017/synctone

# OpenStack Swift
SWIFT_AUTH_URL=http://localhost:5000/v3
SWIFT_USERNAME=swift_user
SWIFT_PASSWORD=swift_secret
SWIFT_PROJECT_NAME=synctone_audio
SWIFT_CONTAINER_AUDIO=novel-chapters
SWIFT_CONTAINER_COVERS=novel-covers

# JWT & API Secrets (Required: minimum 32 high-entropy characters; never commit real secrets)
# Generate securely with: openssl rand -hex 32
JWT_SECRET=<replace-with-output-of-openssl-rand-hex-32>
PORT=4000
```

### Production Deployment & Secret Management
- `docker-compose.prod.yml` requires `JWT_SECRET` in `.env` or environment and fails startup if missing or empty (no hardcoded production fallback).
- The API backend refuses to start when `NODE_ENV=production` if `JWT_SECRET` is missing, shorter than 32 characters, low-entropy, or equal to any example/placeholder string.
- Run `./scripts/deploy-prod.sh` to deploy or update: it generates a 256-bit `JWT_SECRET` cleanly into `.env` (`chmod 600`, never printed to stdout/logs) on fresh installs, upgrades placeholder secrets automatically, and **preserves** valid existing `.env` secrets across redeployments.

### 3. Install Dependencies
```bash
# Frontend
cd novel-audio-synthesizer/frontend
npm install

# Backend TTS Worker
cd ../backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 4. Run Unit & Verification Tests
Verify character grounding and zero-drift audio sample math:
```bash
python3 scratch/verify/test_grounding.py
python3 scratch/verify/test_audio_and_swift.py
```

---

## 📜 Acknowledgements & Academic Citations

- **[`tts-dom-cleaner`](https://www.npmjs.com/package/tts-dom-cleaner)**: Client-side web novel DOM sanitization package authored by the project initiator.
- **[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)**: Ultra-efficient, high-fidelity neural text-to-speech model.
- **[SpaCy](https://spacy.io/)**: Industrial-strength Natural Language Processing in Python.
- **[OpenStack Swift](https://wiki.openstack.org/wiki/Swift)**: Distributed object storage system.

---

## ⚖️ License & Liability Disclaimer

This software is released under the **SyncTone Non-Commercial Source-Available License**. 

> **NOTICE**: Commercial use, monetization, and commercial hosting are strictly prohibited without prior written permission. The Software is provided strictly for academic research and personal study.
> 
> **DISCLAIMER OF LIABILITY**: The author exercises no editorial control over user actions and is **not responsible or liable** for any content, text, or novel uploaded, processed, or synthesized using this software, nor for any copyright violations or legal disputes arising from user-supplied materials. See [LICENSE](LICENSE) for complete terms.
