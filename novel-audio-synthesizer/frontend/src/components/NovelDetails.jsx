import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { preloadUploadChapterModal, preloadReaderView } from '../App';
import {
  CANONICAL_NEURAL_VOICES,
  buildCanonicalVoiceGroups,
  VoiceOptionGroups,
  buildNovelCastList,
  useVoiceAudition,
} from './VoicesView';
import {
  IconPlay,
  IconPause,
  IconRefresh,
  IconUpload,
} from './icons';

function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Audio pending';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatTotalDuration(ms) {
  if (!ms || ms <= 0) return 'AUDIO PENDING';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S`;
  }
  return `${String(minutes).padStart(2, '0')}M ${String(seconds).padStart(2, '0')}S`;
}

export default function NovelDetails({ novelId, onBack, onSelectChapter, onOpenUploadChapter, initialTab }) {
  const { isWriterOrAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('tab');
      if (q && ['overview', 'cast', 'chapters', 'details', 'score'].includes(q)) return q;
    } catch (_) {}
    return initialTab || 'overview';
  });
  const [studioTab, setStudioTab] = useState('cast'); // 'cast' | 'voices' | 'settings' | 'generate'
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableVoices, setAvailableVoices] = useState({});
  const [updatingCharKey, setUpdatingCharKey] = useState(null);
  const [castFeedback, setCastFeedback] = useState(null);

  // Inline + ADD CHARACTER state
  const [showAddCharForm, setShowAddCharForm] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [newCharGender, setNewCharGender] = useState('unknown');
  const [newCharVoice, setNewCharVoice] = useState(CANONICAL_NEURAL_VOICES[1]?.id || 'en-GB-ThomasNeural');
  const [addingChar, setAddingChar] = useState(false);

  // Voices sub-tab Assign-to-Character state
  const [voiceCharTargets, setVoiceCharTargets] = useState({});
  const [assigningModelId, setAssigningModelId] = useState(null);

  const {
    playingId: auditionPlayingId,
    loadingId: auditionLoadingId,
    auditionError,
    setAuditionError,
    toggleAudition,
  } = useVoiceAudition();

  const [inLibrary, setInLibrary] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(`synctone_library_${novelId}`) === 'true';
    } catch (_) {
      return false;
    }
  });

  const coverUploadInputRef = useRef(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const handleCoverFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !novelId) return;
    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const assetRes = await api.novels.uploadAsset(formData);
      if (assetRes?.url) {
        await api.novels.patch(novelId, { cover_object: assetRes.url });
        setData((prev) =>
          prev && prev.novel
            ? { ...prev, novel: { ...prev.novel, cover_object: assetRes.url } }
            : prev
        );
      }
    } catch (err) {
      console.error('Failed to update cover:', err);
      alert('Failed to update cover: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploadingCover(false);
      if (coverUploadInputRef.current) coverUploadInputRef.current.value = '';
    }
  };

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        setInLibrary(localStorage.getItem(`synctone_library_${novelId}`) === 'true');
      }
    } catch (_) {}
  }, [novelId]);

  const handleToggleLibrary = () => {
    setInLibrary((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`synctone_library_${novelId}`, String(next));
        }
      } catch (_) {}
      return next;
    });
  };

  const fetchDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.novels.get(novelId);
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err.message || 'Failed to load novel details';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (novelId) fetchDetails();
  }, [novelId]);

  useEffect(() => {
    let cancelled = false;
    api.voices?.list?.()
      .then((res) => {
        if (!cancelled && res?.available_voices) {
          setAvailableVoices(res.available_voices);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const baseVoiceGroups = useMemo(
    () => buildCanonicalVoiceGroups(availableVoices),
    [availableVoices]
  );

  const applyCharacterVoiceState = (charIdOrName, newVoiceId, extraFields = {}) => {
    const targetLower = String(charIdOrName || '').toLowerCase();
    setData((prev) => {
      if (!prev) return prev;
      const prevChars = Array.isArray(prev.characters) ? prev.characters : [];
      const found = prevChars.some(
        (c) =>
          String(c.id || '').toLowerCase() === targetLower ||
          String(c.canonical_name || c.name || '').toLowerCase() === targetLower
      );
      const nextChars = found
        ? prevChars.map((c) =>
            String(c.id || '').toLowerCase() === targetLower ||
            String(c.canonical_name || c.name || '').toLowerCase() === targetLower
              ? { ...c, voice_id: newVoiceId, ...extraFields }
              : c
          )
        : [
            ...prevChars,
            {
              id: targetLower === 'narrator' ? (prev.novel?.narrator_character_id || 'narrator') : charIdOrName,
              canonical_name: targetLower === 'narrator' ? 'Narrator' : charIdOrName,
              is_narrator: targetLower === 'narrator',
              role: targetLower === 'narrator' ? 'NARRATOR' : 'CAST',
              voice_id: newVoiceId,
              gender: extraFields.gender || 'unknown',
              sample_quote: extraFields.sample_quote || '',
              ...extraFields,
            },
          ];
      const nextNovel =
        targetLower === 'narrator' && prev.novel
          ? { ...prev.novel, narrator_voice_id: newVoiceId, narrator_voice_label: newVoiceId }
          : prev.novel;
      return { ...prev, novel: nextNovel, characters: nextChars };
    });
  };

  const handleCastVoiceChange = async (char, newVoiceId) => {
    if (!data?.novel || !newVoiceId) return;
    const charName = char.canonical_name || char.name || 'Character';
    const charKey = char.id || charName;
    const prevVoice = char.voice_id || 'en-GB-RyanNeural';
    const firstChapterId = data.chapters?.[0]?.id;

    setUpdatingCharKey(charKey);
    setCastFeedback(null);
    applyCharacterVoiceState(charKey, newVoiceId);
    if (char.is_narrator) applyCharacterVoiceState('narrator', newVoiceId);

    try {
      await api.voices.assign({
        novel_id: data.novel.id,
        character_id: charKey,
        new_voice_id: newVoiceId,
        ...(firstChapterId ? { chapter_id: firstChapterId } : {}),
      });
      setCastFeedback(`Assigned ${newVoiceId} to ${charName}`);
    } catch (err) {
      applyCharacterVoiceState(charKey, prevVoice);
      if (char.is_narrator) applyCharacterVoiceState('narrator', prevVoice);
      setCastFeedback(err instanceof ApiError ? err.message : err?.message || `Failed to assign voice for ${charName}`);
    } finally {
      setUpdatingCharKey(null);
    }
  };

  const handleAddCharacterSubmit = async (e) => {
    e.preventDefault();
    if (!data?.novel) return;
    const trimmedName = newCharName.trim();
    if (!trimmedName) {
      setCastFeedback('Please enter a character name.');
      return;
    }

    const isNarrator = trimmedName.toLowerCase() === 'narrator';
    const firstChapterId = data.chapters?.[0]?.id;
    setAddingChar(true);
    setCastFeedback(null);

    try {
      await api.voices.assign({
        novel_id: data.novel.id,
        character_id: isNarrator ? 'narrator' : trimmedName,
        new_voice_id: newCharVoice,
        ...(firstChapterId ? { chapter_id: firstChapterId } : {}),
      });
      applyCharacterVoiceState(isNarrator ? 'narrator' : trimmedName, newCharVoice, {
        canonical_name: isNarrator ? 'Narrator' : trimmedName,
        gender: newCharGender,
        is_narrator: isNarrator,
        role: isNarrator ? 'NARRATOR' : 'CAST',
      });
      setCastFeedback(`Added ${trimmedName} with ${newCharVoice}`);
      setNewCharName('');
      setNewCharGender('unknown');
      setShowAddCharForm(false);
    } catch (err) {
      setCastFeedback(err instanceof ApiError ? err.message : err?.message || 'Failed to add character');
    } finally {
      setAddingChar(false);
    }
  };

  const handleAssignFromVoicesTab = async (voiceModel, castList) => {
    if (!data?.novel) return;
    const fallbackTarget = castList[0]?.id || castList[0]?.canonical_name || 'Narrator';
    const targetCharKey = voiceCharTargets[voiceModel.id] || fallbackTarget;
    const targetChar = castList.find(
      (c) => (c.id || c.canonical_name || c.name) === targetCharKey
    );
    const targetLabel = targetChar?.canonical_name || targetChar?.name || targetCharKey;
    const firstChapterId = data.chapters?.[0]?.id;

    setAssigningModelId(voiceModel.id);
    setCastFeedback(null);
    try {
      await api.voices.assign({
        novel_id: data.novel.id,
        character_id: targetCharKey,
        new_voice_id: voiceModel.id,
        ...(firstChapterId ? { chapter_id: firstChapterId } : {}),
      });
      applyCharacterVoiceState(targetCharKey, voiceModel.id);
      if (targetChar?.is_narrator || String(targetLabel).toLowerCase() === 'narrator') {
        applyCharacterVoiceState('narrator', voiceModel.id);
      }
      setCastFeedback(`Assigned ${voiceModel.id} to ${targetLabel}`);
    } catch (err) {
      setCastFeedback(err instanceof ApiError ? err.message : err?.message || 'Failed to assign voice');
    } finally {
      setAssigningModelId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="detail-stage space-y-6 animate-pulse">
        <h1 className="sr-only">Loading Novel Details</h1>
        <div className="detail-breadcrumb-bar">
          <div className="h-4 w-48 bg-[var(--border-subtle)] rounded-md" />
          <div className="h-4 w-32 bg-[var(--border-subtle)] rounded-md" />
        </div>
        <div className="detail-stage-header space-y-4">
          <div className="h-6 w-56 bg-[var(--border-subtle)] rounded-md" />
          <div className="h-14 w-3/4 bg-[var(--border-subtle)] rounded-xl" />
          <div className="h-4 w-1/2 bg-[var(--border-subtle)] rounded-md" />
          <div className="flex gap-3 pt-2">
            <div className="h-10 w-28 bg-[var(--border-subtle)] rounded-xl" />
            <div className="h-10 w-36 bg-[var(--border-subtle)] rounded-xl" />
            <div className="h-10 w-36 bg-[var(--border-subtle)] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.novel) {
    return (
      <div className="detail-stage">
        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-10 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-main)] flex items-center justify-center mx-auto shadow-xs">
            <IconRefresh className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold font-sans uppercase text-[var(--text-main)]">Error Loading Novel</h3>
          <p className="text-sm font-mono text-[var(--text-sub)] max-w-md mx-auto">{error || 'Novel not found'}</p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onBack}
              className="btn btn-sm"
              aria-label="Back to Library"
            >
              ← Back to Library
            </button>
            <button
              onClick={fetchDetails}
              className="btn btn-sm btn-primary"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { novel, characters = [], chapters = [] } = data;
  const castCharacters = buildNovelCastList(novel, characters);
  const isVerified = novel.channel === 'verified';
  const narratorDisplay =
    novel.narrator ||
    novel.narrator_name ||
    novel.narrator_voice_label ||
    novel.narrator_voice_id ||
    'British Cast Narrator';

  const totalDurationMs =
    chapters.reduce((acc, c) => acc + (c.total_duration_ms || c.duration_ms || 0), 0) ||
    novel.total_duration_ms ||
    0;

  return (
    <div className="detail-stage">
      {/* Back Navigation & Breadcrumb Bar */}
      <div className="detail-breadcrumb-bar">
        <button
          onClick={onBack}
          className="mono-xs text-[var(--text-sub)] hover:text-[var(--text-main)] transition-colors cursor-pointer flex items-center gap-1.5"
          aria-label="Back to Library"
        >
          <span>← BACK TO ARCHIVE CATALOG</span>
          <span className="sr-only">Back to Library</span>
        </button>
        <span className="mono-xs text-[var(--text-muted)] truncate max-w-full">
          CATALOG // {isVerified ? 'VERIFIED' : 'COMMUNITY'} // {novel.title.toUpperCase()} // ID: {novel.id}
        </span>
      </div>

      {/* NOIR MONOCHROME FULL-BLEED STAGE HEADER */}
      <section className="detail-stage-header">
        <span className="badge badge-active" style={{ width: 'fit-content' }}>
          <span className="dot" aria-hidden="true" />
          <span>{isVerified ? 'VERIFIED REPERTORY // AUDIO ARCHIVE' : 'COMMUNITY ARCHIVE // MULTI-VOICE'}</span>
        </span>

        <h1 className="detail-giant-title">
          {novel.title}
        </h1>

        <div className="detail-metadata-bar">
          <span>AUTHOR: {(novel.author_username || 'UNKNOWN').toUpperCase()}</span>
          <span>•</span>
          <span>DURATION: {formatTotalDuration(totalDurationMs)}</span>
          <span>•</span>
          <span>CHAPTERS: {chapters.length} TRACKS</span>
          <span>•</span>
          <span>VOICES: {characters.length} CAST</span>
          <span>•</span>
          <span>FORMAT: {(novel.global_tone || 'MULTI-VOICE ENSEMBLE').toUpperCase()}</span>
        </div>

        {/* Action Buttons Cluster */}
        <div className="detail-actions-cluster">
          <button
            onClick={() => {
              if (chapters.length > 0) {
                onSelectChapter(novel, chapters[0]);
              } else if (onOpenUploadChapter) {
                onOpenUploadChapter(novel);
              }
            }}
            onMouseEnter={preloadReaderView}
            onFocus={preloadReaderView}
            onPointerDown={preloadReaderView}
            className="btn btn-lg btn-primary cursor-pointer active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200 rounded-full shadow-md hover:shadow-lg"
            aria-label={chapters.length > 0 ? 'Start Listening (Ch. 1)' : 'Add Chapter'}
          >
            <span className="dot" aria-hidden="true" />
            <span>{chapters.length > 0 ? 'LISTEN' : 'ADD CHAPTER'}</span>
            <span className="sr-only">{chapters.length > 0 ? 'Start Listening (Ch. 1)' : 'Add Chapter'}</span>
          </button>

          <button
            onClick={() => {
              if (chapters.length > 0) {
                onSelectChapter(novel, chapters[0]);
              } else if (onOpenUploadChapter) {
                onOpenUploadChapter(novel);
              }
            }}
            onMouseEnter={preloadReaderView}
            onFocus={preloadReaderView}
            onPointerDown={preloadReaderView}
            className="btn btn-lg cursor-pointer active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200 rounded-full shadow-xs hover:shadow-md"
            aria-label={chapters.length > 0 ? 'Open Reader' : 'Upload Manuscript'}
          >
            <span className="dot" aria-hidden="true" />
            <span>{chapters.length > 0 ? 'OPEN READER' : 'UPLOAD MANUSCRIPT'}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('cast');
              setTimeout(() => {
                const el = document.getElementById('details-tabs-section') || document.querySelector('[role="tablist"]');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
            }}
            className="btn btn-lg cursor-pointer active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200 rounded-full shadow-xs hover:shadow-md"
            aria-label="Voice Studio"
          >
            <span className="dot" aria-hidden="true" />
            <span>VOICE STUDIO</span>
          </button>

          <button
            className={`btn btn-lg cursor-pointer active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200 rounded-full shadow-xs hover:shadow-md ${
              inLibrary ? 'btn-primary' : ''
            }`}
            onClick={handleToggleLibrary}
            aria-label={inLibrary ? 'In Library' : 'Add to Library'}
          >
            <span className="dot" aria-hidden="true" />
            <span>{inLibrary ? '✓ IN LIBRARY' : '+ ADD TO LIBRARY'}</span>
          </button>

          {isWriterOrAdmin && onOpenUploadChapter && (
            <button
              onClick={() => onOpenUploadChapter(novel)}
              onMouseEnter={preloadUploadChapterModal}
              onFocus={preloadUploadChapterModal}
              className="btn btn-lg cursor-pointer active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-200 rounded-full shadow-xs hover:shadow-md"
              aria-label="Upload Chapter"
            >
              <span className="dot" aria-hidden="true" />
              <span>UPLOAD CHAPTER</span>
            </button>
          )}
        </div>

        {/* Hidden Cover Upload Input */}
        <input
          ref={coverUploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleCoverFileChange}
        />
      </section>

      {/* BOXED MONO TAB BAR */}
      <nav className="tabs-bar" style={{ marginBottom: 24 }} role="tablist" aria-label="Novel Detail Tabs">
        <button
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`tab-btn cursor-pointer ${activeTab === 'overview' ? 'active' : ''}`}
          data-tab="overview"
        >
          OVERVIEW
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'cast'}
          onClick={() => setActiveTab('cast')}
          className={`tab-btn cursor-pointer ${activeTab === 'cast' ? 'active' : ''}`}
          data-tab="cast"
        >
          <span>CAST</span>
          <span className="sr-only">Character Cast</span>
          <span className="ml-1 text-[10px] opacity-60">({characters.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'chapters'}
          onClick={() => setActiveTab('chapters')}
          className={`tab-btn cursor-pointer ${activeTab === 'chapters' ? 'active' : ''}`}
          data-tab="chapters"
        >
          <span>CHAPTERS</span>
          <span className="sr-only">Chapter Directory</span>
          <span className="ml-1 text-[10px] opacity-60">({chapters.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'details'}
          onClick={() => setActiveTab('details')}
          className={`tab-btn cursor-pointer ${activeTab === 'details' ? 'active' : ''}`}
          data-tab="details"
        >
          DETAILS
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'score'}
          onClick={() => setActiveTab('score')}
          className={`tab-btn cursor-pointer ${activeTab === 'score' ? 'active' : ''}`}
          data-tab="score"
        >
          SCORE
        </button>
      </nav>

      {/* TAB CONTENT PANELS */}
      <div className="space-y-4">
        {/* Tab 1: Overview Panel */}
        <section
          id="tab-panel-overview"
          role="tabpanel"
          aria-label="Overview"
          className={`tab-content-panel ${activeTab === 'overview' ? 'active' : ''}`}
          style={{ display: activeTab === 'overview' ? 'block' : 'none' }}
        >
          <div className="detail-overview-grid">
            <div>
              <h3 className="mono-sm mb-3 text-[var(--text-muted)]">// SYNOPSIS</h3>
              <p className="text-[15px] leading-[1.7] text-[var(--text-main)] mb-6 whitespace-pre-line">
                {novel.synopsis || 'No synopsis registered for this literary volume.'}
              </p>
            </div>
            <aside className="detail-matrix-box">
              <span className="mono-xs text-[var(--text-muted)]">// AT A GLANCE</span>
              <div className="detail-matrix-row">
                <span>AUTHOR</span>
                <span className="text-[var(--text-main)] font-semibold">{(novel.author_username || 'Unknown').toUpperCase()}</span>
              </div>
              <div className="detail-matrix-row">
                <span>NARRATOR</span>
                <span className="text-[var(--text-main)] font-semibold">{narratorDisplay}</span>
              </div>
              <div className="detail-matrix-row">
                <span>CAST SIZE</span>
                <span className="text-[var(--text-main)] font-semibold">{characters.length} Voices</span>
              </div>
              <div className="detail-matrix-row">
                <span>CHAPTERS</span>
                <span className="text-[var(--text-main)] font-semibold">{chapters.length} Tracks</span>
              </div>
              <div className="detail-matrix-row">
                <span>TOTAL DURATION</span>
                <span className="text-[var(--text-main)] font-semibold">{formatTotalDuration(totalDurationMs)}</span>
              </div>
              <div className="detail-matrix-row">
                <span>CHANNEL</span>
                <span className="text-[var(--text-main)] font-semibold">{isVerified ? 'VERIFIED REPERTORY' : 'COMMUNITY ARCHIVE'}</span>
              </div>
              <div className="detail-matrix-row">
                <span>STATUS</span>
                <span className="text-[var(--text-main)] font-semibold">{novel.status ? novel.status.toUpperCase() : 'READY FOR PLAYBACK'}</span>
              </div>
            </aside>
          </div>
        </section>

        {/* Tab 2: Cast Panel (Voice Synthesis Studio Parity) */}
        <section
          id="tab-panel-cast"
          role="tabpanel"
          aria-label="Character Cast"
          className={`tab-content-panel ${activeTab === 'cast' ? 'active' : ''}`}
          style={{ display: activeTab === 'cast' ? 'block' : 'none' }}
        >
          <div className="studio-card-container">
            {/* Studio Header */}
            <div className="studio-header">
              <div className="flex items-center gap-3">
                <span className="brand-symbol" />
                <span className="font-mono text-xs sm:text-[13px] font-bold text-[var(--text-main)]">
                  VOICE SYNTHESIS STUDIO // ENSEMBLE &amp; TIMBRE
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="boxed-btn px-2.5 py-1 text-[11px] font-mono cursor-pointer rounded-lg hover:border-[var(--text-main)] active:scale-95 transition-all shadow-xs"
                aria-label="Close Voice Studio"
              >
                CLOSE [×]
              </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <nav className="tabs-bar">
              <button
                type="button"
                onClick={() => setStudioTab('cast')}
                className={`tab-btn ${studioTab === 'cast' ? 'active' : ''}`}
                data-tab="cast"
              >
                CAST ({castCharacters.length})
              </button>
              <button
                type="button"
                onClick={() => setStudioTab('voices')}
                className={`tab-btn ${studioTab === 'voices' ? 'active' : ''}`}
                data-tab="voices"
              >
                VOICES
              </button>
              <button
                type="button"
                onClick={() => setStudioTab('settings')}
                className={`tab-btn ${studioTab === 'settings' ? 'active' : ''}`}
                data-tab="settings"
              >
                SETTINGS
              </button>
              <button
                type="button"
                onClick={() => setStudioTab('generate')}
                className={`tab-btn ${studioTab === 'generate' ? 'active' : ''}`}
                data-tab="generate"
              >
                GENERATE
              </button>
            </nav>

            <div className="studio-body">
              {/* Persistent Synthesis Progress Banner (Section 9.4 Compliant) */}
              <section className="synthesis-banner-box">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span className="mono-xs font-semibold text-[var(--text-main)]">
                    SYNTHESIS STATUS // {novel.title.toUpperCase()}
                  </span>
                  <span className="badge">
                    {/* Section 9.4: Neutral dot when ready/complete, signal dot strictly when synthesizing */}
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                    <span>AUDIO ENSEMBLE READY</span>
                  </span>
                </div>

                <div className="synthesis-progress-track">
                  <div className="synthesis-progress-fill" style={{ width: '100%' }} />
                </div>

                <div className="flex justify-between items-center flex-wrap gap-2 mono-xs">
                  <span className="text-[var(--text-muted)]">
                    PROGRESS: 100% COMPLETE // {characters.length} OF {characters.length} VOICES ASSIGNED
                  </span>
                  <span className="text-[var(--text-main)]">
                    MULTI-VOICE ENSEMBLE // 48KHZ READY
                  </span>
                </div>
              </section>

              {(castFeedback || auditionError) && (
                <div
                  role="status"
                  className="mb-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-mono text-[var(--text-main)] flex items-center justify-between gap-2"
                >
                  <span>{auditionError || castFeedback}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCastFeedback(null);
                      setAuditionError(null);
                    }}
                    className="text-[10px] uppercase text-[var(--text-sub)] hover:text-[var(--text-main)] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Sub-Tab 1: Cast */}
              {studioTab === 'cast' && (
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <span className="mono-xs text-[var(--text-muted)]">// CHARACTER VOICE ASSIGNMENTS</span>
                    <button
                      type="button"
                      onClick={() => setShowAddCharForm((prev) => !prev)}
                      className="boxed-btn px-3 py-1 text-[11px] font-mono cursor-pointer flex items-center gap-1.5 rounded-full active:scale-95 transition-all shadow-xs hover:scale-105"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-main)]" />
                      <span>{showAddCharForm ? 'CANCEL' : '+ ADD CHARACTER'}</span>
                    </button>
                  </div>

                  {showAddCharForm && (
                    <form
                      onSubmit={handleAddCharacterSubmit}
                      className="mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] space-y-3 font-mono text-xs"
                    >
                      <div className="text-[11px] font-bold uppercase text-[var(--text-main)]">
                        Add Character to Ensemble
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          aria-label="Character Name"
                          value={newCharName}
                          onChange={(e) => setNewCharName(e.target.value)}
                          placeholder="Character Name"
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
                        />
                        <select
                          aria-label="Character Gender"
                          value={newCharGender}
                          onChange={(e) => setNewCharGender(e.target.value)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
                        >
                          <option value="unknown">Gender: Unknown</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="neutral">Neutral</option>
                        </select>
                        <select
                          aria-label="Character Voice Model"
                          value={newCharVoice}
                          onChange={(e) => setNewCharVoice(e.target.value)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:outline-none focus:border-[var(--border-strong)]"
                        >
                          <VoiceOptionGroups groups={baseVoiceGroups} />
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCharForm(false)}
                          className="px-3 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-sub)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addingChar}
                          className="px-3.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] font-bold cursor-pointer disabled:opacity-50"
                        >
                          {addingChar ? 'Adding...' : 'Save Character'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="roster-grid">
                    {castCharacters.length === 0 ? (
                      <div className="col-span-full p-8 text-center bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-xs">
                        No character profiles generated.
                      </div>
                    ) : (
                      castCharacters.map((char) => {
                        const charName = char.canonical_name || char.name || 'Character';
                        const charKey = char.id || charName;
                        const charRole = char.role || (char.is_narrator ? 'NARRATOR' : 'CAST');
                        const charVoice = char.voice_id || 'en-GB-RyanNeural';
                        const charVoiceGroups = buildCanonicalVoiceGroups(availableVoices, [charVoice]);
                        const auditionKey = `cast:${charKey}`;
                        const isAuditionPlaying = auditionPlayingId === auditionKey;
                        const isAuditionLoading = auditionLoadingId === auditionKey;

                        return (
                          <div key={charKey} className="character-card">
                            <div className="char-header-row">
                              <span className="char-name">{charName}</span>
                              <span className="char-role-badge">{charRole.toUpperCase()}</span>
                            </div>
                            <div className="char-traits-list">
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center gap-2">
                                  <span>MODEL:</span>
                                  <span className="text-[11px] font-mono text-[var(--text-main)] font-semibold truncate">
                                    {charVoice}
                                  </span>
                                </div>
                                <select
                                  aria-label={`Voice model for ${charName}`}
                                  value={charVoice}
                                  disabled={updatingCharKey === charKey}
                                  onChange={(e) => handleCastVoiceChange(char, e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-strong)] focus:outline-none focus:border-[var(--text-main)] disabled:opacity-50"
                                >
                                  <VoiceOptionGroups groups={charVoiceGroups} />
                                </select>
                              </div>
                              <div>PITCH OFFSET: +0.00 ST</div>
                              <div>CADENCE PACE: 1.00×</div>
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span>
                                  STATUS: <span className="text-[var(--text-main)]">● ASSIGNED</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleAudition({
                                      key: auditionKey,
                                      voiceId: charVoice,
                                      text: char.sample_quote || `Hello, I am ${charName}.`,
                                      characterId: charKey,
                                      speakerName: charName,
                                      isNarrator: Boolean(char.is_narrator),
                                      gender: char.gender || '',
                                    })
                                  }
                                  className="boxed-btn px-2.5 py-1 text-[10px] font-mono uppercase inline-flex items-center gap-1 rounded-full cursor-pointer"
                                  aria-label={`Audition voice for ${charName}`}
                                >
                                  {isAuditionLoading ? (
                                    <>
                                      <IconRefresh className="w-3 h-3 animate-spin" />
                                      <span>Loading</span>
                                    </>
                                  ) : isAuditionPlaying ? (
                                    <>
                                      <IconPause className="w-3 h-3 fill-current" />
                                      <span>Stop</span>
                                    </>
                                  ) : (
                                    <>
                                      <IconPlay className="w-3 h-3 fill-current" />
                                      <span>Audition</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              {char.sample_quote && (
                                <div className="italic font-serif text-xs text-[var(--text-sub)] line-clamp-2 pt-2 mt-1 border-t border-[var(--border-subtle)]">
                                  &ldquo;{char.sample_quote}&rdquo;
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Sub-Tab 2: Voices */}
              {studioTab === 'voices' && (
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <span className="mono-xs text-[var(--text-muted)]">// NEURAL VOICE LIBRARY</span>
                    <span className="mono-xs text-[var(--text-sub)]">{CANONICAL_NEURAL_VOICES.length} NEURAL MODELS</span>
                  </div>

                  <div className="roster-grid">
                    {CANONICAL_NEURAL_VOICES.map((m) => {
                      const auditionKey = `lib:${m.id}`;
                      const isAuditionPlaying = auditionPlayingId === auditionKey;
                      const isAuditionLoading = auditionLoadingId === auditionKey;
                      const defaultTarget = castCharacters[0]?.id || castCharacters[0]?.canonical_name || 'Narrator';
                      const targetCharKey = voiceCharTargets[m.id] || defaultTarget;

                      return (
                        <div key={m.id} className="character-card">
                          <div className="char-header-row">
                            <span className="char-name">{m.id}</span>
                            <span className="char-role-badge">{m.role}</span>
                          </div>
                          <div className="char-traits-list space-y-2">
                            <div>PROFILE: {m.label}</div>
                            <div>TIMBRE: {m.timbre}</div>
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">GENDER: {m.gender.toUpperCase()}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleAudition({
                                    key: auditionKey,
                                    voiceId: m.id,
                                    text: `This is ${m.label}, speaking with ${m.timbre}.`,
                                    characterId: m.id,
                                    speakerName: m.label,
                                    isNarrator: m.id === 'en-GB-RyanNeural',
                                    gender: m.gender,
                                  })
                                }
                                className="boxed-btn px-2.5 py-1 text-[10px] font-mono uppercase inline-flex items-center gap-1 rounded-full cursor-pointer"
                                aria-label={`Audition ${m.id}`}
                              >
                                {isAuditionLoading ? (
                                  <>
                                    <IconRefresh className="w-3 h-3 animate-spin" />
                                    <span>Loading</span>
                                  </>
                                ) : isAuditionPlaying ? (
                                  <>
                                    <IconPause className="w-3 h-3 fill-current" />
                                    <span>Stop</span>
                                  </>
                                ) : (
                                  <>
                                    <IconPlay className="w-3 h-3 fill-current" />
                                    <span>Audition</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="pt-2 mt-1 border-t border-[var(--border-subtle)] space-y-1.5">
                              <span className="block text-[10px] text-[var(--text-muted)] font-mono uppercase">
                                Assign to Character
                              </span>
                              <div className="flex items-center gap-1.5">
                                <select
                                  aria-label={`Assign ${m.id} to character`}
                                  value={targetCharKey}
                                  onChange={(e) =>
                                    setVoiceCharTargets((prev) => ({ ...prev, [m.id]: e.target.value }))
                                  }
                                  className="flex-1 min-w-0 px-2 py-1 rounded-lg text-[11px] font-mono bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
                                >
                                  {castCharacters.map((c) => {
                                    const cKey = c.id || c.canonical_name || c.name || 'Narrator';
                                    const cName = c.canonical_name || c.name || 'Narrator';
                                    return (
                                      <option key={cKey} value={cKey}>
                                        {cName}
                                      </option>
                                    );
                                  })}
                                </select>
                                <button
                                  type="button"
                                  disabled={assigningModelId === m.id}
                                  onClick={() => handleAssignFromVoicesTab(m, castCharacters)}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase bg-[var(--accent)] text-[var(--on-accent)] cursor-pointer disabled:opacity-50"
                                >
                                  {assigningModelId === m.id ? '...' : 'Assign'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sub-Tab 3: Settings */}
              {studioTab === 'settings' && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 flex flex-col gap-5">
                  <span className="mono-xs text-[var(--text-muted)] block">
                    // SYNTHESIS TIMBRE PARAMETERS
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div>
                      <label className="mono-xs text-[var(--text-sub)] block mb-2">
                        EMOTIONAL RANGE [78%]
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="78"
                        className="w-full accent-[var(--accent)] cursor-pointer"
                        aria-label="Emotional Range"
                      />
                    </div>
                    <div>
                      <label className="mono-xs text-[var(--text-sub)] block mb-2">
                        BREATH PHONEME RATE [42%]
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="42"
                        className="w-full accent-[var(--accent)] cursor-pointer"
                        aria-label="Breath Phoneme Rate"
                      />
                    </div>
                    <div>
                      <label className="mono-xs text-[var(--text-sub)] block mb-2">
                        ACOUSTIC REVERB [15%]
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="15"
                        className="w-full accent-[var(--accent)] cursor-pointer"
                        aria-label="Acoustic Reverb"
                      />
                    </div>
                    <div>
                      <label className="mono-xs text-[var(--text-sub)] block mb-2">
                        PACING MULTIPLIER [1.00×]
                      </label>
                      <input
                        type="range"
                        min="80"
                        max="140"
                        defaultValue="100"
                        className="w-full accent-[var(--accent)] cursor-pointer"
                        aria-label="Pacing Multiplier"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Tab 4: Generate */}
              {studioTab === 'generate' && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 flex flex-col gap-4 rounded-2xl shadow-sm">
                  <span className="mono-xs text-[var(--text-muted)] block">
                    // CHAPTER AUDIO GENERATION
                  </span>
                  <p className="text-xs text-[var(--text-sub)] leading-relaxed">
                    Synthesize multi-voice audio for uploaded chapters. Audio segments are generated according to character voice assignments above.
                  </p>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => chapters.length > 0 && onSelectChapter(novel, chapters[0])}
                      className="boxed-btn-primary px-4 py-2 text-xs font-mono cursor-pointer flex items-center gap-2 rounded-full active:scale-[0.96] hover:scale-[1.03] hover:-translate-y-0.5 transition-all shadow-md"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>GENERATE AUDIO FOR CH. 01</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Tab 3: Chapters Panel */}
        <section
          id="tab-panel-chapters"
          role="tabpanel"
          aria-label="Chapter Directory"
          className={`tab-content-panel ${activeTab === 'chapters' ? 'active' : ''}`}
          style={{ display: activeTab === 'chapters' ? 'block' : 'none' }}
        >
          <div className="chapters-directory-list">
            {chapters.length === 0 ? (
              <div className="p-8 text-center bg-[var(--bg-card)] text-[var(--text-muted)] font-mono text-xs">
                No chapters uploaded yet.
              </div>
            ) : (
              chapters.map((ch, idx) => {
                const chNumber = ch.chapter_number || idx + 1;
                const chTitle = ch.title || `Chapter ${chNumber}`;
                const chDuration = ch.total_duration_ms || ch.duration_ms || 0;
                const hasAudio = chDuration > 0 || ch.has_studio_audio;
                const progressPercent = typeof ch.progress_percent === 'number'
                  ? ch.progress_percent
                  : (chDuration > 0 && typeof ch.playback_progress_ms === 'number'
                    ? Math.min(100, Math.round((ch.playback_progress_ms / chDuration) * 100))
                    : (ch.status === 'completed' ? 100 : null));
                return (
                  <div
                    key={ch.id || idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectChapter(novel, ch)}
                    onMouseEnter={preloadReaderView}
                    onFocus={preloadReaderView}
                    onPointerDown={preloadReaderView}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectChapter(novel, ch);
                      }
                    }}
                    className="chapter-row-item cursor-pointer"
                  >
                    <span className="chapter-idx">CH. {String(chNumber).padStart(2, '0')}</span>
                    <span className="chapter-title truncate">{chTitle}</span>
                    <span className="chapter-duration">{formatDuration(chDuration)}</span>
                    <span className={`badge ${hasAudio ? 'badge-active' : ''}`}>
                      <span className="dot" aria-hidden="true" />
                      <span>{hasAudio ? 'SYNTHESIZED' : 'PENDING'}</span>
                    </span>
                    {progressPercent !== null && (
                      <span className="mono-xs text-[var(--text-muted)] text-[10px] hidden sm:inline">
                        {progressPercent === 100 ? 'COMPLETED' : `${progressPercent}%`}
                      </span>
                    )}
                    <button
                      className="btn btn-sm btn-primary rounded-full active:scale-95 transition-all shadow-xs hover:scale-105"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChapter(novel, ch);
                      }}
                      aria-label={`Read & Listen to ${chTitle}`}
                    >
                      <span className="dot" aria-hidden="true" />
                      <span>PLAY</span>
                      <span className="sr-only">Read & Listen</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Tab 4: Details Panel */}
        <section
          id="tab-panel-details"
          role="tabpanel"
          aria-label="Archive Details"
          className={`tab-content-panel ${activeTab === 'details' ? 'active' : ''}`}
          style={{ display: activeTab === 'details' ? 'block' : 'none' }}
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 flex flex-col gap-5">
            <h3 className="mono-sm text-[var(--text-main)]">// ACOUSTIC & SYNTHESIS ARCHITECTURE</h3>
            <p className="text-sm leading-relaxed text-[var(--text-sub)]">
              SyncTone produces high-resolution neural speech synthesized against time-aligned character phoneme tags.
              Playback utilizes multi-channel acoustic streams mapped to authentic character vocal profiles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-[var(--border-subtle)] p-3.5 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">CHANNEL ARCHIVE</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">
                  {isVerified ? 'VERIFIED ORIGINAL' : 'COMMUNITY REPERTORY'}
                </span>
              </div>
              <div className="border border-[var(--border-subtle)] p-3.5 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">EDITORIAL TONE</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">
                  {(novel.global_tone || 'DRAMATIC ENSEMBLE').toUpperCase()}
                </span>
              </div>
              <div className="border border-[var(--border-subtle)] p-3.5 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">RECORDED DURATION</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">
                  {formatTotalDuration(totalDurationMs)}
                </span>
              </div>
              <div className="border border-[var(--border-subtle)] p-3.5 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">PLAYBACK STATUS</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">
                  {novel.status ? novel.status.toUpperCase() : 'READY FOR PLAYBACK'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Tab 5: Score Panel */}
        <section
          id="tab-panel-score"
          role="tabpanel"
          aria-label="Atmospheric Score"
          className={`tab-content-panel ${activeTab === 'score' ? 'active' : ''}`}
          style={{ display: activeTab === 'score' ? 'block' : 'none' }}
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 flex flex-col gap-5">
            <h3 className="mono-sm text-[var(--text-main)]">// GENERATIVE ATMOSPHERIC SOUNDSCAPES</h3>
            <p className="text-sm leading-relaxed text-[var(--text-sub)]">
              Dynamic atmospheric background soundscapes calibrated to narrative tension and reader pacing.
              Ambience runs synchronously with the chapter reading engine.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">ACOUSTIC PROFILE</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">
                  {(novel.global_tone || 'DRAMATIC ENSEMBLE').toUpperCase()}
                </span>
              </div>
              <div className="border border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">SOUNDTRACK ENGINE</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">DYNAMIC AMBIENCE</span>
              </div>
              <div className="border border-[var(--border-subtle)] p-4 bg-[var(--bg-surface)]">
                <span className="mono-xs text-[var(--text-muted)] block mb-1">STATUS</span>
                <span className="mono-xs text-[var(--text-main)] font-semibold">CALIBRATED // REAL-TIME</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
