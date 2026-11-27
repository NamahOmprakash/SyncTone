const path = require('path');
const fs = require('fs');
const os = require('os');

// Robust .env resolution: checks repo root, parent dir, and backend dir
const BACKEND_DIR = path.resolve(__dirname, '../..');
const PARENT_DIR = path.resolve(BACKEND_DIR, '..');
const REPO_ROOT = path.resolve(PARENT_DIR, '..');
const ROOT_DIR = REPO_ROOT;
const IS_VERCEL = Boolean(process.env.VERCEL);

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

// Storage Directories: safely resolves output, chapters, and models both locally, in Docker, and on Vercel (/tmp)
const outputDir = IS_VERCEL
  ? path.join(os.tmpdir(), 'synctone-output')
  : findFirstExistingDir(
      [
        path.resolve(REPO_ROOT, 'output'),
        path.resolve(PARENT_DIR, 'output'),
        path.resolve(BACKEND_DIR, 'output'),
      ],
      path.resolve(PARENT_DIR, 'output')
    );

const chaptersDir = IS_VERCEL
  ? path.join(os.tmpdir(), 'synctone-chapters')
  : findFirstExistingDir(
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

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://10.0.2.2:5173',
];

function parseCorsOrigins(rawOrigins) {
  if (!rawOrigins || typeof rawOrigins !== 'string') return [...DEFAULT_CORS_ORIGINS];
  const extras = rawOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...extras]));
}

const INSECURE_JWT_DEFAULTS = new Set([
  'synctone_production_jwt_secret_token_key_2026',
  'synctone_super_secret_jwt_key_2026_dev_mode',
  'super_secret_jwt_key_synctone_2026',
  'replace_with_a_cryptographically_secure_random_jwt_secret_key_2026',
]);

function isWeakOrPlaceholderJwtSecret(secret) {
  if (typeof secret !== 'string') return true;
  const trimmed = secret.trim();
  if (trimmed.length < 32) return true;
  if (INSECURE_JWT_DEFAULTS.has(trimmed)) return true;
  if (/^replace_with_/i.test(trimmed) || /^(changeme|secret|default|password)/i.test(trimmed)) return true;
  if (new Set(trimmed).size < 10) return true;
  return false;
}

const isProdRuntime = process.env.NODE_ENV === 'production' || IS_VERCEL;
const resolvedJwtSecret = process.env.JWT_SECRET || (isProdRuntime ? '' : 'synctone_super_secret_jwt_key_2026_dev_mode');
if (isProdRuntime && isWeakOrPlaceholderJwtSecret(resolvedJwtSecret)) {
  throw new Error(
    'Fatal security configuration: JWT_SECRET must be configured with at least 32 high-entropy characters (never a hardcoded default or placeholder) in production.'
  );
}

const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: resolvedJwtSecret,
  lowMemoryMode: process.env.LOW_MEMORY_MODE === 'true' || IS_VERCEL,
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  allowVercelPreviews: process.env.ALLOW_VERCEL_PREVIEWS !== 'false',
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  // Database
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://synctone_user:synctone_pass@localhost:5432/synctone',
  pgSsl:
    process.env.PG_SSL !== 'false' &&
    (process.env.PG_SSL === 'true' ||
      /[?&]sslmode=(require|verify-full|verify-ca)/i.test(process.env.DATABASE_URL || '') ||
      /\.(supabase\.(co|com)|neon\.tech)/i.test(process.env.DATABASE_URL || '')),
  pgSslRejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === 'true',
  mongoUri:
    process.env.MONGO_URI ||
    'mongodb://synctone_user:synctone_pass@localhost:27017/synctone?authSource=admin',

  // Unified Object Storage (S3-compatible, Neon Object Storage AWS_* vars, MongoDB Atlas GridFS, OpenStack Swift, or Local)
  storage: {
    provider: (
      process.env.STORAGE_PROVIDER ||
      (process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
        ? 's3'
        : process.env.MONGO_URI && !/localhost|127\.0\.0\.1/i.test(process.env.MONGO_URI)
          ? 'mongodb'
          : 'swift')
    ).toLowerCase(),
    s3Endpoint: process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3 || '',
    s3Region: process.env.S3_REGION || process.env.AWS_REGION || 'auto',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    bucketAudio: process.env.S3_BUCKET_AUDIO || process.env.SWIFT_CONTAINER_AUDIO || 'synctone-audio',
    bucketCovers: process.env.S3_BUCKET_COVERS || process.env.SWIFT_CONTAINER_COVERS || 'synctone-covers',
    publicAudioUrl: (process.env.STORAGE_PUBLIC_AUDIO_URL || '').replace(/\/$/, ''),
    publicCoversUrl: (process.env.STORAGE_PUBLIC_COVERS_URL || '').replace(/\/$/, ''),
  },

  // Multi-method Authentication (WebAuthn Passkeys + Google/GitHub OAuth + Neon Auth)
  auth: {
    rpName: process.env.WEBAUTHN_RP_NAME || 'SyncTone Audio Studio',
    rpId: process.env.WEBAUTHN_RP_ID || undefined,
    origin: process.env.APP_ORIGIN || process.env.FRONTEND_URL || undefined,
    neonAuthBaseUrl: (
      process.env.NEON_AUTH_BASE_URL ||
      process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
      (/neon\.tech/i.test(process.env.DATABASE_URL || '')
        ? 'https://ep-little-voice-az8eugmh.neonauth.c-3.ap-southeast-1.aws.neon.tech/neondb/auth'
        : '')
    ).replace(/\/$/, ''),
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      redirectUri: process.env.GITHUB_REDIRECT_URI || '',
    },
  },

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

  // Paradee-8M-v1.2 Micro ONNX Model
  paradee: {
    modelDir: path.join(modelsDir, 'paradee'),
    onnxFile: path.join(modelsDir, 'paradee', 'paradee_int8.onnx'),
    configFile: path.join(modelsDir, 'paradee', 'config.json'),
  },

  // Google Gemini Multimodal AI (Tier 2 Parser & Attribution)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '90000', 10),
  },

  // Baidu Unlimited-OCR via vLLM OpenAI-compatible Server (Tier 3 Parser)
  unlimitedOcr: {
    baseUrl: process.env.UNLIMITED_OCR_URL || 'http://localhost:8000/v1',
    model: process.env.UNLIMITED_OCR_MODEL || 'baidu/Unlimited-OCR',
    timeoutMs: parseInt(process.env.UNLIMITED_OCR_TIMEOUT_MS || '120000', 10),
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
