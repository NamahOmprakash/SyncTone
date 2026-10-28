import { useState, useEffect, useRef, useCallback } from 'react';

export function useSynthesisProgress(chapterId) {
  const [progressState, setProgressState] = useState({
    status: 'idle', // 'idle' | 'parsing' | 'synthesizing' | 'stitching' | 'complete' | 'failed'
    percentComplete: 0,
    currentSegment: null,
    totalSegments: null,
    message: '',
    error: null,
    isConnected: false,
    isComplete: false,
    isFailed: false,
  });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!chapterId || typeof window === 'undefined') return;

    // Clean up any existing connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/ws/progress/${chapterId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setProgressState((prev) => ({ ...prev, isConnected: true }));

        // Send ping every 15s to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send('ping');
            } catch (_) {}
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        if (event.data === 'pong') return;

        try {
          const data = JSON.parse(event.data);
          if (!data || typeof data !== 'object') return;

          const status = (data.status || 'synthesizing').toLowerCase();
          const percent = typeof data.percent_complete === 'number' ? data.percent_complete : 0;
          const currentSeg = data.current_segment !== undefined ? data.current_segment : null;
          const totalSegs = data.total_segments !== undefined ? data.total_segments : null;
          const errorMsg = data.error || (status === 'failed' ? 'Synthesis encountered an error' : null);

          // Construct descriptive status message from actual backend payload
          let msg = '';
          if (status === 'parsing') {
            msg = 'Parsing text & attributing character voices...';
          } else if (status === 'synthesizing') {
            msg = currentSeg && totalSegs
              ? `Synthesizing audio segment ${currentSeg} of ${totalSegs} (${percent}%)`
              : `Synthesizing audio (${percent}%)`;
          } else if (status === 'stitching') {
            msg = 'Stitching audio segments with 250ms silence frames...';
          } else if (status === 'complete') {
            msg = 'Audio synthesis completed successfully!';
          } else if (status === 'failed') {
            msg = errorMsg || 'Synthesis failed';
          }

          setProgressState({
            status,
            percentComplete: percent,
            currentSegment: currentSeg,
            totalSegments: totalSegs,
            message: msg,
            error: errorMsg,
            isConnected: true,
            isComplete: status === 'complete',
            isFailed: status === 'failed',
          });

          // Close connection if complete or failed
          if (status === 'complete' || status === 'failed') {
            clearInterval(pingIntervalRef.current);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              try {
                wsRef.current.close();
              } catch (_) {}
            }
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setProgressState((prev) => ({ ...prev, isConnected: false }));
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        clearInterval(pingIntervalRef.current);
        setProgressState((prev) => ({ ...prev, isConnected: false }));
      };
    } catch (_) {}
  }, [chapterId]);

  useEffect(() => {
    isMountedRef.current = true;
    if (chapterId) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      clearInterval(pingIntervalRef.current);
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
      }
    };
  }, [chapterId, connect]);

  const reset = useCallback(() => {
    setProgressState({
      status: 'idle',
      percentComplete: 0,
      currentSegment: null,
      totalSegments: null,
      message: '',
      error: null,
      isConnected: false,
      isComplete: false,
      isFailed: false,
    });
  }, []);

  return {
    ...progressState,
    reconnect: connect,
    reset,
  };
}

export default useSynthesisProgress;
