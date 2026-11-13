import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api, ApiError } from '../services/api';
import {
  buildCanonicalVoiceGroups,
  VoiceOptionGroups,
  CANONICAL_NEURAL_VOICES,
} from './VoicesView';
import {
  IconUsers,
  IconX,
  IconCheck,
  IconMic,
} from './icons';

function getVoiceTierBadge(voiceId = '', rankIdx = 0, isNarrator = false) {
  if (isNarrator) {
    return { label: 'NARRATOR', color: 'text-[var(--text-main)] border-[var(--border-strong)] bg-[var(--bg-surface)]' };
  }
  if (['bm_fable', 'bf_isabella', 'am_puck', 'af_heart'].includes(voiceId)) {
    return { label: 'PARADEE-8M', color: 'text-[var(--text-main)] border-[var(--border-strong)] bg-[var(--bg-surface)]' };
  }
  if (String(voiceId).startsWith('mac_')) {
    return { label: 'MACHINE EXTRA', color: 'text-[var(--text-sub)] border-[var(--border-subtle)] bg-[var(--bg-surface)]' };
  }
  if (rankIdx < 3) {
    return { label: 'PRIMARY CAST', color: 'text-[var(--text-main)] border-[var(--border-strong)] bg-[var(--bg-surface)]' };
  }
  return { label: 'EXTRA ENSEMBLE', color: 'text-[var(--text-sub)] border-[var(--border-subtle)] bg-[var(--bg-surface)]' };
}

export default function CharacterRoster({
  chapterId,
  segments = [],
  onClose,
  onVoiceChange,
}) {
  const [characters, setCharacters] = useState([]);
  const [customCharacters, setCustomCharacters] = useState([]);
  const [availableVoices, setAvailableVoices] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Inline + ADD CHARACTER form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharGender, setNewCharGender] = useState('unknown');
  const [newCharVoice, setNewCharVoice] = useState(CANONICAL_NEURAL_VOICES[1]?.id || 'en-GB-ThomasNeural');
  const [addingChar, setAddingChar] = useState(false);

  // Aggregate detected characters (including Narrator pinned to top) and sample quotes from segments
  useEffect(() => {
    const charMap = new Map();

    for (const seg of segments) {
      if (seg.type === 'image') continue;
      const rawKey = seg.character_id || seg.speaker_id || (seg.type === 'narration' ? 'narrator' : null);
      if (!rawKey) continue;
      const lowerKey = String(rawKey).toLowerCase();
      if (['unresolved', 'unknown', 'unknown_speaker', 'image'].includes(lowerKey)) continue;

      const isNarrator = lowerKey === 'narrator' || seg.type === 'narration';
      const charKey = isNarrator ? 'narrator' : rawKey;
      const existing = charMap.get(charKey);
      if (existing) {
        existing.segmentCount++;
        if (!existing.sampleQuote && seg.type === 'dialogue' && seg.text) {
          existing.sampleQuote = seg.text;
        }
      } else {
        charMap.set(charKey, {
          id: charKey,
          name: isNarrator ? 'Narrator' : (seg.speaker_name || rawKey),
          isNarrator,
          voiceId: seg.assigned_voice_id || seg.voice_id || (isNarrator ? 'en-GB-RyanNeural' : 'en-GB-ThomasNeural'),
          segmentCount: 1,
          sampleQuote: seg.type === 'dialogue' ? seg.text : '',
        });
      }
    }

    // Merge any manually added characters not yet present in segments
    for (const custom of customCharacters) {
      if (!charMap.has(custom.id)) {
        charMap.set(custom.id, custom);
      }
    }

    const list = Array.from(charMap.values()).sort((a, b) => {
      if (a.isNarrator && !b.isNarrator) return -1;
      if (!a.isNarrator && b.isNarrator) return 1;
      return 0;
    });

    setCharacters(list);

    // Fetch voice palette from real endpoint
    api.voices
      .list()
      .then((data) => {
        setAvailableVoices(data.available_voices || {});
      })
      .catch((err) => {
        console.warn('[CharacterRoster] Failed to load voice catalog:', err.message);
      });
  }, [segments, customCharacters]);

  const baseVoiceGroups = useMemo(
    () => buildCanonicalVoiceGroups(availableVoices),
    [availableVoices]
  );

  const handleVoiceSelect = async (characterId, newVoiceId) => {
    if (!newVoiceId) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setUpdatingId(characterId);

    // Save previous for rollback
    const prevVoice = characters.find((c) => c.id === characterId)?.voiceId;

    // Optimistic update
    setCharacters((prev) =>
      prev.map((c) => (c.id === characterId ? { ...c, voiceId: newVoiceId } : c))
    );
    setCustomCharacters((prev) =>
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
        setCustomCharacters((prev) =>
          prev.map((c) => (c.id === characterId ? { ...c, voiceId: prevVoice } : c))
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddCharacterSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = newCharName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a character name.');
      return;
    }

    const isNarrator = trimmedName.toLowerCase() === 'narrator';
    const charId = isNarrator
      ? 'narrator'
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || trimmedName;

    setAddingChar(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.voices.assign({
        character_id: charId,
        new_voice_id: newCharVoice,
        chapter_id: chapterId,
      });

      const newEntry = {
        id: charId,
        name: trimmedName,
        gender: newCharGender,
        isNarrator,
        voiceId: newCharVoice,
        segmentCount: 0,
        sampleQuote: '',
      };

      setCustomCharacters((prev) => {
        const filtered = prev.filter((c) => c.id !== charId);
        return [...filtered, newEntry];
      });
      setSuccessMessage(`Added ${trimmedName} with voice ${newCharVoice}`);
      if (onVoiceChange) {
        onVoiceChange(charId, newCharVoice);
      }
      setNewCharName('');
      setNewCharGender('unknown');
      setShowAddForm(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to add character';
      setErrorMessage(msg);
    } finally {
      setAddingChar(false);
    }
  };

  const drawerRef = useRef(null);
  const openerRef = useRef(null);

  // Focus trap & return focus to opener on unmount
  useEffect(() => {
    openerRef.current = document.activeElement;
    if (drawerRef.current) {
      const focusables = drawerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    }

    return () => {
      if (openerRef.current && typeof openerRef.current.focus === 'function') {
        openerRef.current.focus();
      }
    };
  }, []);

  // Close roster drawer on Escape key and trap Tab focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop Scrim over Reader Content */}
      <div
        onClick={onClose}
        aria-hidden="true"
        data-testid="roster-scrim"
        className="fixed inset-x-0 bottom-0 z-30 bg-black/40 backdrop-blur-[1px] cursor-pointer transition-opacity animate-fadeIn"
        style={{ top: 'var(--topbar-h, 3.5rem)' }}
      />

      {/* Character Roster Drawer */}
      <div
        ref={drawerRef}
        id="character-roster-drawer"
        tabIndex="-1"
        className="fixed right-0 w-full md:w-[clamp(320px,30vw,420px)] max-w-full top-[var(--topbar-h,3.5rem)] bottom-[var(--dock-safe-bottom,4.5rem)] bg-[var(--bg-surface)] shadow-2xl border-l border-b border-[var(--border-subtle)] z-40 flex flex-col animate-slideLeft transition-colors duration-200 outline-none"
        style={{
          top: 'var(--topbar-h, 3.5rem)',
          bottom: 'var(--dock-safe-bottom, 4.5rem)',
        }}
        role="dialog"
        aria-label="Character Roster"
        aria-modal="true"
      >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div>
          <h2 className="text-sm font-bold font-sans uppercase tracking-tight text-[var(--text-main)] flex items-center gap-2">
            <IconUsers className="w-4 h-4 text-[var(--text-main)]" />
            <span>Character Roster</span>
          </h2>
          <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
            {characters.length} character{characters.length === 1 ? '' : 's'} detected in this chapter
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="boxed-btn text-[10px] font-mono px-2 py-1 flex items-center gap-1 cursor-pointer hover:border-[var(--text-main)] transition"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{showAddForm ? 'CANCEL' : '+ ADD CHARACTER'}</span>
          </button>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition cursor-pointer"
            aria-label="Close roster"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline + ADD CHARACTER Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddCharacterSubmit}
          className="mx-4 mt-3 p-3 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl space-y-2.5 text-xs font-mono"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-main)]">
              Add Character Profile
            </span>
          </div>
          <input
            type="text"
            aria-label="Character Name"
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
            placeholder="Character Name (e.g. Dr. Watson)"
            className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Character Gender"
              value={newCharGender}
              onChange={(e) => setNewCharGender(e.target.value)}
              className="px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
            >
              <option value="unknown">Gender: Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="neutral">Neutral</option>
            </select>
            <select
              aria-label="New Character Voice Model"
              value={newCharVoice}
              onChange={(e) => setNewCharVoice(e.target.value)}
              className="px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
            >
              <VoiceOptionGroups groups={baseVoiceGroups} />
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingChar}
              className="px-3 py-1 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] font-bold cursor-pointer disabled:opacity-50"
            >
              {addingChar ? 'Adding...' : 'Add Character'}
            </button>
          </div>
        </form>
      )}

      {/* Alerts */}
      {errorMessage && (
        <div className="mx-4 mt-3 p-3 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl text-[var(--text-main)] text-xs font-mono flex items-center justify-between shadow-xs">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-[var(--text-main)] font-bold ml-2 cursor-pointer">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-4 mt-3 p-3 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl text-[var(--text-main)] text-xs font-mono flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-1.5">
            <IconCheck className="w-3.5 h-3.5" />
            <span>{successMessage}</span>
          </span>
          <button onClick={() => setSuccessMessage(null)} className="text-[var(--text-main)] font-bold ml-2 cursor-pointer">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Roster List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {characters.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-muted)] text-xs font-mono">
            <IconMic className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No speaking characters detected in this chapter.
          </div>
        ) : (
          characters.map((char, idx) => {
            const isUpdating = updatingId === char.id;
            const tierBadge = getVoiceTierBadge(char.voiceId, idx, char.isNarrator);
            const charVoiceGroups = buildCanonicalVoiceGroups(availableVoices, [char.voiceId]);

            return (
              <div
                key={char.id}
                className="p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] space-y-3 shadow-xs"
              >
                {/* Character Name & Dialogue count */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold font-sans uppercase tracking-tight text-xs text-[var(--text-main)] flex items-center gap-1.5 min-w-0 truncate">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--text-main)]" />
                    <span className="truncate">{char.name}</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${tierBadge.color}`}>
                      {tierBadge.label}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                      {char.segmentCount} line{char.segmentCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Sample Quote */}
                {char.sampleQuote && (
                  <p className="text-xs text-[var(--text-sub)] italic bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--border-subtle)] line-clamp-2 font-serif">
                    "{char.sampleQuote.replace(/^["“”]|["“”]$/g, '')}"
                  </p>
                )}

                {/* Voice Selection & Character Traits (VOICE, PITCH, PACE, STATUS) */}
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      VOICE:
                    </label>

                    <select
                      aria-label={`Voice for ${char.name}`}
                      value={char.voiceId}
                      disabled={isUpdating}
                      onChange={(e) => handleVoiceSelect(char.id, e.target.value)}
                      className="text-xs px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg focus:outline-none focus:border-[var(--text-main)] transition font-mono text-[var(--text-main)] disabled:opacity-50 min-w-0 max-w-[210px] truncate"
                    >
                      <VoiceOptionGroups groups={charVoiceGroups} />
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-sub)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold">PITCH:</span>
                    <span>+0.00 ST</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-sub)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold">PACE:</span>
                    <span>1.00×</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-sub)]">
                    <span className="text-[10px] text-[var(--text-muted)] font-bold">STATUS:</span>
                    <span className="text-[var(--text-main)] font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                      <span>ASSIGNED</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
}
