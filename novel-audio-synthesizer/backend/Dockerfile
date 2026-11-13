# ==============================================================================
# SyncTone Express.js API Gateway & Audio Engine Dockerfile
# Production-ready Node.js 20 Debian Bookworm with Python 3 / ONNX Runtime Bridge
# ==============================================================================
FROM node:20-bookworm-slim

WORKDIR /app

# Install system audio, espeak-ng, ffmpeg, curl, and Python 3 build toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    ffmpeg \
    espeak-ng \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up isolated Python virtual environment for ONNX Runtime & NLP parser
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHON_BIN="/opt/venv/bin/python3"

# Install Python requirements for book parsing and local ONNX speech synthesis
# onnxruntime wheels require glibc (Debian), compatible with soundfile and numpy
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    pypdf \
    pypdfium2 \
    onnxruntime \
    kokoro-onnx \
    soundfile \
    numpy

# Ensure system-wide python3 alias resolves to the virtual environment
RUN ln -sf /opt/venv/bin/python3 /usr/bin/python3 && \
    ln -sf /opt/venv/bin/python /usr/bin/python

# Install Node.js dependencies & generate authoritative Prisma Client
COPY package*.json ./
COPY prisma ./prisma
RUN npm install && npx prisma generate

# Copy backend application source
COPY src ./src

# Create runtime storage, chapters, and models directories
RUN mkdir -p /app/output/covers /app/chapters /app/models_cache /app/kokoro-tts-backend/models_cache

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

CMD ["node", "src/index.js"]
