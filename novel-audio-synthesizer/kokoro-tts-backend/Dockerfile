# ==============================================================================
# SyncTone Kokoro-TTS Offline Worker Daemon Dockerfile
# Python 3.11 Debian Slim with PyDub, ONNX Runtime, and Spacy NLP Engine
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install system audio, espeak-ng phonemizer, ffmpeg, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    espeak-ng \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm

# Copy worker application
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Create cache and persistent storage directories
RUN mkdir -p /app/output/pcm_cache /app/models_cache

CMD ["sh", "-c", "alembic upgrade head && python -m app.worker"]
