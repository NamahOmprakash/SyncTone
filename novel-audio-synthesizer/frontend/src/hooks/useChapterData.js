import { useState, useCallback, useMemo } from 'react';

function connectProgressWebSocket(chapterId, onProgress) {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/api/ws/progress/${chapterId}`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && typeof data === 'object') {
          const parts = [];
          if (data.status) {
            const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);
            parts.push(statusLabel);
          }
          if (typeof data.percent_complete === 'number') {
            parts.push(`${data.percent_complete}%`);
          }
          if (data.current_segment !== undefined && data.total_segments) {
            parts.push(`(${data.current_segment}/${data.total_segments} segments)`);
          }
          if (parts.length > 0) {
            onProgress(parts.join(' '));
          }
        }
      } catch (_e) {}
    };
    return ws;
  } catch (_err) {
    return null;
  }
}

const API_BASE = '/api';

export function useChapterData() {
  const [state, setState] = useState({
    chapterId: null,
    parsed: null,
    manifest: null,
    isLoading: false,
    error: null,
    progress: '',
  });

  const setLoading = (progress) =>
    setState((prev) => ({ ...prev, isLoading: true, error: null, progress }));

  const setError = (error) =>
    setState((prev) => ({ ...prev, isLoading: false, error, progress: '' }));

  const uploadText = useCallback(async (text, title = 'Untitled Chapter') => {
    setLoading('Uploading chapter...');
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title }),
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);

      const data = await res.json();
      setState((prev) => ({
        ...prev,
        chapterId: data.chapter_id,
        isLoading: false,
        progress: '',
      }));
      return data.chapter_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      return null;
    }
  }, []);

  const parseChapter = useCallback(async (chapterId) => {
    setLoading('Parsing text & attributing dialogue...');
    let ws = null;
    try {
      ws = connectProgressWebSocket(chapterId, (msg) => {
        setState((prev) => ({ ...prev, progress: msg }));
      });

      const res = await fetch(`${API_BASE}/parse/${chapterId}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`Parse failed: ${res.statusText}`);

      const parsed = await res.json();
      setState((prev) => ({ ...prev, parsed, isLoading: false, progress: '' }));
      return parsed;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
      return null;
    } finally {
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
    }
  }, []);

  const synthesizeChapter = useCallback(async (chapterId) => {
    setLoading('Synthesizing audio...');
    let ws = null;
    try {
      ws = connectProgressWebSocket(chapterId, (msg) => {
        setState((prev) => ({ ...prev, progress: msg }));
      });

      const res = await fetch(`${API_BASE}/synthesize/${chapterId}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) throw new Error(`Synthesis failed: ${res.statusText}`);

      const manifest = await res.json();
      setState((prev) => ({ ...prev, manifest, isLoading: false, progress: '' }));
      return manifest;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synthesis failed');
      return null;
    } finally {
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
    }
  }, []);

  const overrideVoice = useCallback(async (characterId, newVoiceId, chapterId) => {
    try {
      const res = await fetch(`${API_BASE}/voices/assign`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: characterId,
          new_voice_id: newVoiceId,
          chapter_id: chapterId,
        }),
      });
      if (!res.ok) throw new Error(`Voice override failed: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice override failed');
      return null;
    }
  }, []);

  const checkModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status/models`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      chapterId: null,
      parsed: null,
      manifest: null,
      isLoading: false,
      error: null,
      progress: '',
    });
  }, []);

  const uploadChapter = uploadText;

  const actions = useMemo(
    () => ({ uploadText, uploadChapter, parseChapter, synthesizeChapter, overrideVoice, checkModels, reset, setState }),
    [uploadText, uploadChapter, parseChapter, synthesizeChapter, overrideVoice, checkModels, reset]
  );

  return [state, actions];
}
