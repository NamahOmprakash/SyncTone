/**
 * SyncTone — Synthesis Event Dispatcher
 *
 * Real-time event pub/sub for audiobook synthesis progress.
 * Supports dual WebSocket and Server-Sent Events (SSE) streaming
 * with in-memory state caching and status normalization.
 */

const { EventEmitter } = require('events');

const VALID_STATUSES = new Set(['idle', 'parsing', 'synthesizing', 'stitching', 'complete', 'failed']);

const STATUS_ALIASES = {
  attributing: 'parsing',
  completed: 'complete',
  done: 'complete',
  error: 'failed',
  processing: 'synthesizing',
  queued: 'idle',
};

/**
 * Normalizes input status string to one of:
 * 'idle' | 'parsing' | 'synthesizing' | 'stitching' | 'complete' | 'failed'
 */
function normalizeStatus(rawStatus) {
  if (!rawStatus) return 'idle';
  const s = String(rawStatus).toLowerCase().trim();
  if (VALID_STATUSES.has(s)) return s;
  if (STATUS_ALIASES[s]) return STATUS_ALIASES[s];
  return 'idle';
}

class SynthesisEventDispatcher extends EventEmitter {
  constructor() {
    super();
    this.wsClients = new Map();
    this.sseClients = new Map();
    this.cachedProgress = new Map();
  }

  /**
   * Registers a WebSocket connection for a given chapterId.
   * Sends cached progress immediately if available.
   */
  addWebSocket(chapterId, ws) {
    const id = String(chapterId);
    if (!this.wsClients.has(id)) {
      this.wsClients.set(id, new Set());
    }
    const set = this.wsClients.get(id);
    set.add(ws);

    // Send latest cached state on connect
    const cached = this.getLatest(id);
    if (cached && ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(JSON.stringify(cached));
      } catch (_err) {
        set.delete(ws);
      }
    }

    const cleanup = () => this.removeWebSocket(id, ws);
    ws.once('close', cleanup);
    ws.once('error', cleanup);
  }

  /**
   * Unregisters a WebSocket connection.
   */
  removeWebSocket(chapterId, ws) {
    const id = String(chapterId);
    const set = this.wsClients.get(id);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        this.wsClients.delete(id);
      }
    }
  }

  /**
   * Registers an Express Response object as an SSE client for a given chapterId.
   * Sends cached progress immediately if available.
   */
  addSseClient(chapterId, res) {
    const id = String(chapterId);
    if (!this.sseClients.has(id)) {
      this.sseClients.set(id, new Set());
    }
    const set = this.sseClients.get(id);
    set.add(res);

    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    }
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Send latest cached state on connect
    const cached = this.getLatest(id);
    if (cached) {
      try {
        res.write(`data: ${JSON.stringify(cached)}\n\n`);
      } catch (_err) {
        set.delete(res);
      }
    }

    const cleanup = () => this.removeSseClient(id, res);
    res.once('close', cleanup);
    res.once('finish', cleanup);
    res.once('error', cleanup);
  }

  /**
   * Unregisters an SSE response client.
   */
  removeSseClient(chapterId, res) {
    const id = String(chapterId);
    const set = this.sseClients.get(id);
    if (set) {
      set.delete(res);
      if (set.size === 0) {
        this.sseClients.delete(id);
      }
    }
  }

  /**
   * Dispatches a progress event: normalizes payload, caches in memory,
   * emits event locally, and broadcasts JSON to all registered WebSocket and SSE clients.
   *
   * @param {string} chapterId - Chapter identifier
   * @param {object} event - Event details
   * @returns {object} Normalized event payload
   */
  dispatch(chapterId, event = {}) {
    const id = String(chapterId || event.chapter_id || '');
    const status = normalizeStatus(event.status);

    const percentComplete = typeof event.percent_complete === 'number'
      ? event.percent_complete
      : Number(event.progress_pct || 0);

    const payload = {
      chapter_id: id,
      status,
      percent_complete: Math.max(0, Math.min(100, Math.round(percentComplete))),
      current_segment: Number(event.current_segment || 0),
      total_segments: Number(event.total_segments || 0),
      error: event.error ? String(event.error) : null,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    // Cache in memory
    this.cachedProgress.set(id, payload);

    // Emit event on EventEmitter
    this.emit('progress', payload);
    this.emit(`progress:${id}`, payload);

    const json = JSON.stringify(payload);

    // Broadcast to WebSocket clients
    const wsSet = this.wsClients.get(id);
    if (wsSet) {
      for (const ws of wsSet) {
        if (ws.readyState === 1 /* OPEN */) {
          try {
            ws.send(json);
          } catch (_err) {
            wsSet.delete(ws);
          }
        } else {
          wsSet.delete(ws);
        }
      }
      if (wsSet.size === 0) {
        this.wsClients.delete(id);
      }
    }

    // Broadcast to SSE clients
    const sseSet = this.sseClients.get(id);
    if (sseSet) {
      for (const res of sseSet) {
        try {
          res.write(`data: ${json}\n\n`);
        } catch (_err) {
          sseSet.delete(res);
        }
      }
      if (sseSet.size === 0) {
        this.sseClients.delete(id);
      }
    }

    return payload;
  }

  /**
   * Retrieves the most recent cached progress payload for a chapter.
   *
   * @param {string} chapterId
   * @returns {object|null}
   */
  getLatest(chapterId) {
    const id = String(chapterId);
    return this.cachedProgress.get(id) || null;
  }
}

const eventDispatcher = new SynthesisEventDispatcher();

module.exports = {
  SynthesisEventDispatcher,
  eventDispatcher,
};
module.exports.SynthesisEventDispatcher = SynthesisEventDispatcher;
module.exports.eventDispatcher = eventDispatcher;
module.exports.default = eventDispatcher;
