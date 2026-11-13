const path = require('path');
const fs = require('fs');

// Robust .env resolution: checks repo root, parent dir, and backend dir
const BACKEND_DIR = path.resolve(__dirname, '../..');
const PARENT_DIR = path.resolve(BACKEND_DIR, '..');
const REPO_ROOT = path.resolve(PARENT_DIR, '..');
const ROOT_DIR = REPO_ROOT;

const envCandidates = [
  path.resolve(REPO_ROOT, '.env'),
  path.resolve(PARENT_DIR, '.env'),
  path.resolve(BACKEND_DIR, '.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}
require('dotenv').config();

function findFirstExistingDir(candidates, fallback) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return fallback;
}

// Storage Directories: safely resolves output, chapters, and models both locally and in Docker container
const outputDir = findFirstExistingDir(
  [
    path.resolve(REPO_ROOT, 'output'),
    path.resolve(PARENT_DIR, 'output'),
    path.resolve(BACKEND_DIR, 'output'),
  ],
  path.resolve(PARENT_DIR, 'output')
);

const chaptersDir = findFirstExistingDir(
  [
    path.resolve(REPO_ROOT, 'chapters'),
    path.resolve(PARENT_DIR, 'chapters'),
    path.resolve(BACKEND_DIR, 'chapters'),
  ],
  path.resolve(PARENT_DIR, 'chapters')
);

const modelsDir = findFirstExistingDir(
  [
    path.resolve(PARENT_DIR, 'kokoro-tts-backend/models_cache'),
    path.resolve(REPO_ROOT, 'novel-audio-synthesizer/kokoro-tts-backend/models_cache'),
    path.resolve(BACKEND_DIR, 'models_cache'),
  ],
  path.resolve(PARENT_DIR, 'kokoro-tts-backend/models_cache')
);

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'synctone_super_secret_jwt_key_2026_dev_mode',

  // Database
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://synctone_user:synctone_pass@localhost:5432/synctone',
  mongoUri:
    process.env.MONGO_URI ||
    'mongodb://synctone_user:synctone_pass@localhost:27017/synctone?authSource=admin',

  // OpenStack Swift
  swift: {
    authUrl: process.env.SWIFT_AUTH_URL || 'http://localhost:8080/auth/v1.0',
    username: process.env.SWIFT_USERNAME || 'test:tester',
    key: process.env.SWIFT_KEY || 'testing',
    containerAudio: process.env.SWIFT_CONTAINER_AUDIO || 'novel-chapters',
    containerCovers: process.env.SWIFT_CONTAINER_COVERS || 'novel-covers',
  },

  // LLM / Ollama
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'mistral',
  },

  // Storage Directories
  paths: {
    root: ROOT_DIR,
    outputDir,
    chaptersDir,
    modelsDir,
  },

  audio: {
    sampleRate: 24000,
    interSpeakerPauseMs: 300,
  },
};

module.exports = { config };
