/**
 * SyncTone — WebSocket Gateway
 *
 * Provides real-time synthesis progress streaming at /api/ws/progress/:chapterId.
 * Integrated with SynthesisEventDispatcher for bidirectional event distribution,
 * heartbeat handling, and reconnection state hydration.
 */

const { WebSocketServer } = require('ws');
const { eventDispatcher } = require('./engine/eventDispatcher');

/**
 * Broadcasts progress updates for a chapter to all active WebSocket and SSE clients.
 *
 * @param {string} chapterId - Target chapter identifier
 * @param {object} progress - Progress status and metric details
 */
function broadcastProgress(chapterId, progress) {
  return eventDispatcher.dispatch(chapterId, progress);
}

/**
 * Initializes and binds the WebSocket server to the HTTP server instance.
 *
 * @param {import('http').Server} server
 * @returns {WebSocketServer}
 */
function setupWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    const match = url.match(/^\/api\/ws\/progress\/([^/?]+)/);

    if (match) {
      const chapterId = match[1];
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, chapterId);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, _req, chapterId) => {
    console.log(`[WS] Client connected for chapter ${chapterId}`);

    // Register with centralized event dispatcher (delivers cached progress on connect)
    eventDispatcher.addWebSocket(chapterId, ws);

    // Heartbeat ping-pong
    ws.on('message', (message) => {
      if (message.toString() === 'ping') {
        ws.send('pong');
      }
    });

    ws.on('close', () => {
      eventDispatcher.removeWebSocket(chapterId, ws);
      console.log(`[WS] Client disconnected for chapter ${chapterId}`);
    });

    ws.on('error', (err) => {
      console.warn(`[WS] Connection error on chapter ${chapterId}:`, err.message);
      eventDispatcher.removeWebSocket(chapterId, ws);
    });
  });

  return wss;
}

module.exports = {
  broadcastProgress,
  setupWebSocketServer,
  eventDispatcher,
};
