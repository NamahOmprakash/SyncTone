import React, { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { getSpeakerColor } from '../utils/speakerColors';
import {
  IconUsers,
  IconLock,
  IconX,
  IconCheck,
  IconMic,
} from './icons';

export default function CharacterRoster({
  chapterId,
  segments = [],
  onClose,
  onVoiceChange,
}) {
  const { isWriterOrAdmin } = useAuth();
  const [characters, setCharacters] = useState([]);
  const [availableVoices, setAvailableVoices] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Aggregate detected characters and sample quotes from segments
  useEffect(() => {
    const charMap = new Map();

    for (const seg of segments) {
      const charKey = seg.character_id || seg.speaker_id;
      if (charKey && charKey !== 'narrator' && charKey !== 'unresolved') {
        const existing = charMap.get(charKey);
        if (existing) {
          existing.segmentCount++;
          if (!existing.sampleQuote && seg.type === 'dialogue' && seg.text) {
            existing.sampleQuote = seg.text;
          }
        } else {
          charMap.set(charKey, {
            id: charKey,
            name: seg.speaker_name || charKey,
            voiceId: seg.assigned_voice_id || seg.voice_id || 'en-GB-ThomasNeural',
            segmentCount: 1,
            sampleQuote: seg.type === 'dialogue' ? seg.text : '',
          });
        }
      }
    }

    setCharacters(Array.from(charMap.values()));

    // Fetch voice palette from real endpoint
    api.voices
      .list()
      .then((data) => {
        setAvailableVoices(data.available_voices || {});
      })
      .catch((err) => {
        console.warn('[CharacterRoster] Failed to load voice catalog:', err.message);
      });
  }, [segments]);

  const handleVoiceSelect = async (characterId, newVoiceId) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setUpdatingId(characterId);

    // Save previous for rollback
    const prevVoice = characters.find((c) => c.id === characterId)?.voiceId;

    // Optimistic update
    setCharacters((prev) =>
      prev.map((c) => (c.id === characterId ? { ...c, voiceId: newVoiceId } : c))
    );

    try {
      await api.voices.assign({
        character_id: characterId,
        new_voice_id: newVoiceId,
        chapter_id: chapterId,
      });

      setSuccessMessage(`Updated voice for ${characterId} to ${newVoiceId}`);
      if (onVoiceChange) {
        onVoiceChange(characterId, newVoiceId);
      }
    } catch (err) {
      // Safe compensation & reconciliation on failure
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to update voice';
      setErrorMessage(msg);
      if (prevVoice) {
        setCharacters((prev) =>
          prev.map((c) => (c.id === characterId ? { ...c, voiceId: prevVoice } : c))
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div
      className="fixed inset-y-0 right-0 w-88 max-w-full theme-surface shadow-2xl border-l z-50 flex flex-col animate-slideLeft transition-colors duration-200"
      role="dialog"
      aria-label="Character Roster"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b theme-border theme-card">
        <div>
          <h2 className="text-base font-bold theme-heading flex items-center gap-2">
            <IconUsers className="w-4 h-4 text-[var(--accent)]" />
            <span>Character Roster</span>
          </h2>
          <p className="text-xs theme-muted mt-0.5">
            {characters.length} character{characters.length === 1 ? '' : 's'} detected in this chapter
          </p>
        </div>
        <button
          onClick={onClose}
          className="theme-muted hover:text-[var(--text-main)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition"
          aria-label="Close roster"
        >
          <IconX className="w-4 h-4" />
        </button>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="mx-4 mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 font-bold ml-2">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-4 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <IconCheck className="w-3.5 h-3.5" />
            <span>{successMessage}</span>
          </span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 font-bold ml-2">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Roster List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {characters.length === 0 ? (
          <div className="text-center py-12 theme-muted text-sm">
            <IconMic className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No speaking characters detected in this chapter.
          </div>
        ) : (
          characters.map((char) => {
            const isUpdating = updatingId === char.id;

            return (
              <div
                key={char.id}
                className="p-4 theme-card rounded-2xl border space-y-3 transition-transform duration-120 hover:-translate-y-0.5 active:scale-[0.99]"
              >
                {/* Character Name & Dialogue count */}
                <div className="flex items-center justify-between">
                  <span className="font-bold theme-heading text-sm flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                    {char.name}
                  </span>
                  <span className="text-[11px] font-mono theme-muted theme-surface px-2 py-0.5 rounded-md border">
                    {char.segmentCount} line{char.segmentCount === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Sample Quote */}
                {char.sampleQuote && (
                  <p className="text-xs theme-sub italic theme-surface p-2.5 rounded-xl border line-clamp-2 font-serif">
                    "{char.sampleQuote.replace(/^["“”]|["“”]$/g, '')}"
                  </p>
                )}

                {/* Voice Selection / Read-Only View */}
                <div className="pt-2 border-t theme-border">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-semibold theme-muted uppercase tracking-wider font-mono">
                      Voice:
                    </label>

                    {isWriterOrAdmin ? (
                      <select
                        value={char.voiceId}
                        disabled={isUpdating}
                        onChange={(e) => handleVoiceSelect(char.id, e.target.value)}
                        className="text-xs px-2.5 py-1.5 theme-surface border rounded-xl focus:outline-none focus:border-[var(--border-focus)] transition font-medium theme-heading disabled:opacity-50"
                      >
                        {Object.entries(availableVoices).map(([archetype, voiceId]) => (
                          <option key={archetype} value={voiceId}>
                            {archetype} ({voiceId})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-semibold theme-sub theme-surface px-2.5 py-1 rounded-lg border flex items-center gap-1 font-mono">
                        <IconLock className="w-3 h-3 text-[var(--accent)]" />
                        <span>{char.voiceId}</span>
                      </span>
                    )}
                  </div>

                  {!isWriterOrAdmin && (
                    <p className="text-[10px] theme-muted mt-1 text-right">
                      Sign in as writer/admin to override voices.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
