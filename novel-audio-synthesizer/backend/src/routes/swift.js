const { Router } = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { config } = require('../config');

const router = Router();

let cachedSwiftToken = null;
let cachedStorageUrl = null;
let tokenExpiresAt = 0;
let refreshPromise = null;

async function getSwiftAuth(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSwiftToken && cachedStorageUrl && now < tokenExpiresAt - 300000) {
    return { token: cachedSwiftToken, storageUrl: cachedStorageUrl };
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await axios.get(config.swift.authUrl, {
          headers: {
            'X-Storage-User': config.swift.username,
            'X-Storage-Pass': config.swift.key,
          },
          timeout: 5000,
        });
        cachedSwiftToken = res.headers['x-auth-token'];
        cachedStorageUrl = res.headers['x-storage-url'] || 'http://localhost:8080/v1/AUTH_test';
        const ttlSec = parseInt(
          res.headers['x-auth-token-expires'] || res.headers['x-token-expires'] || '3600',
          10
        );
        tokenExpiresAt = Date.now() + ttlSec * 1000;
        return { token: cachedSwiftToken, storageUrl: cachedStorageUrl };
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// GET /api/chapters/:id/audio (Swift audio streaming proxy)
router.get('/chapters/:id/audio', async (req, res) => {
  const { id } = req.params;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'Invalid chapter UUID format.' });

  try {
    const dbRes = await pool.query(
      'SELECT swift_audio_object, total_duration_ms, status FROM chapters WHERE id = $1',
      [id]
    );

    if (dbRes.rows.length === 0) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const { swift_audio_object } = dbRes.rows[0];
    if (!swift_audio_object) {
      return res.status(400).json({ error: 'Audio not synthesized yet' });
    }

    const fetchSwiftStream = async (forceTokenRefresh = false) => {
      const { token, storageUrl } = await getSwiftAuth(forceTokenRefresh);
      const swiftUrl = `${storageUrl}/${config.swift.containerAudio}/${swift_audio_object}`;

      const rangeHeader = req.headers.range;
      const swiftHeaders = { 'X-Auth-Token': token };
      if (rangeHeader) swiftHeaders['Range'] = rangeHeader;

      return axios.get(swiftUrl, {
        headers: swiftHeaders,
        responseType: 'stream',
        validateStatus: (s) => s === 200 || s === 206 || s === 416,
      });
    };

    let swiftRes;
    try {
      swiftRes = await fetchSwiftStream(false);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        cachedSwiftToken = null;
        swiftRes = await fetchSwiftStream(true);
      } else {
        throw err;
      }
    }

    // If Swift returns 401 directly without throwing
    if (swiftRes.status === 401) {
      cachedSwiftToken = null;
      swiftRes = await fetchSwiftStream(true);
    }

    res.status(swiftRes.status);
    if (swiftRes.status === 416) {
      if (swiftRes.headers['content-range']) {
        res.setHeader('Content-Range', String(swiftRes.headers['content-range']));
      }
      return res.end();
    }

    if (swiftRes.headers['content-range']) {
      res.setHeader('Content-Range', String(swiftRes.headers['content-range']));
    }
    if (swiftRes.headers['content-length']) {
      res.setHeader('Content-Length', String(swiftRes.headers['content-length']));
    }
    res.setHeader('Accept-Ranges', 'bytes');
    let swiftContentType = 'audio/opus';
    if (swift_audio_object.endsWith('.mp3')) {
      swiftContentType = 'audio/mpeg';
    } else if (swift_audio_object.endsWith('.wav')) {
      swiftContentType = 'audio/wav';
    }
    res.setHeader('Content-Type', swiftContentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    swiftRes.data.pipe(res);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      cachedSwiftToken = null;
    }
    console.warn('[SwiftProxy] Swift unavailable or returned error, checking local fallback:', err.message);

    // Fallback to local audio file if available
    const fs = require('fs');
    const path = require('path');
    const audioPathMp3 = path.join(config.paths.outputDir, `${id}.mp3`);
    const audioPathWav = path.join(config.paths.outputDir, `${id}.wav`);
    const fallbackPath = fs.existsSync(audioPathMp3)
      ? audioPathMp3
      : (fs.existsSync(audioPathWav) ? audioPathWav : null);

    if (fallbackPath) {
      const stat = fs.statSync(fallbackPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const contentType = fallbackPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': contentType,
        });
        return fs.createReadStream(fallbackPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });
        return fs.createReadStream(fallbackPath).pipe(res);
      }
    }

    return res.status(500).json({ error: 'Failed to stream audio from object storage' });
  }
});

router.getSwiftAuth = getSwiftAuth;

module.exports = router;
