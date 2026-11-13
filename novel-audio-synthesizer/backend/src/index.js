const http = require('http');
const { createApp } = require('./app');
const { setupWebSocketServer } = require('./websocket');
const { connectMongo, connectPostgres } = require('./db');
const { config } = require('./config');

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  setupWebSocketServer(server);

  server.listen(config.port, () => {
    console.log(`[SyncTone API] Express server running at http://localhost:${config.port}`);
    console.log(`[SyncTone API] Static audio directory: ${config.paths.outputDir}`);
    console.log(`[SyncTone API] WebSocket available at ws://localhost:${config.port}/api/ws/progress/:id`);
  });

  connectMongo().catch((e) => console.warn('[DB] Mongo connect warning:', e.message));
  connectPostgres().catch((e) => console.warn('[DB] Postgres connect warning:', e.message));
}

bootstrap().catch((err) => {
  console.error('[SyncTone API] Bootstrap failed:', err);
  process.exit(1);
});
