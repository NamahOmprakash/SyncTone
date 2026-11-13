// Pure transparent streaming reverse proxy from 5173 to 5174
// Preserves headers, status codes, cookies, CORS, and WebSocket upgrades
const http = require('http');

const TARGET_PORT = 5174;
const TARGET_HOST = 'localhost';
const LISTEN_PORT = 5173;

const server = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`,
      'x-forwarded-host': clientReq.headers.host || `localhost:${LISTEN_PORT}`,
      'x-forwarded-proto': 'http',
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Forward status and headers directly without 307 redirects
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Gateway unavailable: ' + err.message }));
    }
  });

  clientReq.pipe(proxyReq, { end: true });
});

// Full WebSocket upgrade support for Vite HMR and Live Voice Synthesis
server.on('upgrade', (req, socket, head) => {
  const proxyReq = http.request({
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`,
    },
  });

  proxyReq.on('upgrade', (res, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(res.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n'
    );
    if (proxyHead && proxyHead.length) {
      socket.write(proxyHead);
    }
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', () => {
    socket.destroy();
  });

  proxyReq.end();
});

server.listen(LISTEN_PORT, 'localhost', () => {
  console.log(`[SyncTone Reverse Proxy] Transparently piping http://localhost:${LISTEN_PORT} <-> http://localhost:${TARGET_PORT}`);
});

server.on('error', (err) => {
  console.error('[SyncTone Reverse Proxy Error]:', err);
});
