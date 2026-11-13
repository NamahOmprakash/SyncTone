# ==============================================================================
# SyncTone Express.js API Gateway & Audio Engine Dockerfile
# ==============================================================================
FROM node:20-alpine

WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache ffmpeg curl

# Install npm dependencies & generate Prisma Client
COPY package*.json ./
COPY prisma ./prisma
RUN npm install && npx prisma generate

# Copy application source
COPY src ./src

# Create runtime directories
RUN mkdir -p /app/output /app/chapters

EXPOSE 4000

CMD ["node", "src/index.js"]
