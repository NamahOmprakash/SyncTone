import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAudioSync } from './hooks/useAudioSync';
import { usePlaybackProgress } from './hooks/usePlaybackProgress';
import { useSynthesisProgress } from './hooks/useSynthesisProgress';
import { api } from './services/api';

import SidebarNav from './components/SidebarNav';
import TopHeader from './components/TopHeader';
import NovelCatalog from './components/NovelCatalog';
import NovelDetails from './components/NovelDetails';
import ReaderView from './components/ReaderView';
import AudioPlayer from './components/AudioPlayer';
import CharacterRoster from './components/CharacterRoster';
import SynthesisProgressBar from './components/SynthesisProgressBar';
import AuthModal from './components/AuthModal';
import AddNovelModal from './components/AddNovelModal';
import UploadChapterModal from './components/UploadChapterModal';
import SettingsModal from './components/SettingsModal';
import { IconClock, IconX } from './components/icons';
import { executeViewTransition } from './tokens/motion';

const EMPTY_ARRAY = [];

export default function App() {
  const { user, role, isAuthenticated, isWriterOrAdmin } = useAuth();

  // Navigation View: 'catalog' | 'details' | 'reader' | 'settings' | 'upload'
  const [view, setView] = useState('catalog');
  const [selectedNovelId, setSelectedNovelId] = useState(null);
  const [currentNovel, setCurrentNovel] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);

  // Chapter prose and manifest data
  const [chapterSegments, setChapterSegments] = useState(EMPTY_ARRAY);
  const [chapterManifest, setChapterManifest] = useState(null);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState(null);

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showAddNovelModal, setShowAddNovelModal] = useState(false);
  const [showUploadChapterModal, setShowUploadChapterModal] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);

  // Audio Synchronization Hook (60fps loop with binary search)
  const audioSync = useAudioSync(chapterManifest?.timeline ?? EMPTY_ARRAY);

  // 4NF Playback Progress Hook (auto-resume & throttled persistence)
  const playbackProgress = usePlaybackProgress({
    novelId: currentNovel?.id,
    chapterId: currentChapter?.id,
    user,
    audioSync,
    timeline: chapterManifest?.timeline ?? EMPTY_ARRAY,
  });

  // Real-time WebSocket Synthesis Progress Hook
  const synthesisProgress = useSynthesisProgress(currentChapter?.id);

  // Helper for safe scroll without jsdom not-implemented warning
  const safeScrollToTop = (behavior = 'instant') => {
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior });
      }
    } catch (_) {}
  };

  // Centralized navigation handler with View Transitions & History state sync
  const handleNavigate = (targetView, novelId = null) => {
    executeViewTransition(() => {
      if (targetView === 'catalog') {
        setSelectedNovelId(null);
      } else if (targetView === 'details') {
        const id = novelId || selectedNovelId || currentNovel?.id;
        if (id) setSelectedNovelId(id);
      }
      setView(targetView);
      setShowRoster(false);

      try {
        if (typeof window !== 'undefined' && window.history) {
          const stateNovelId = novelId || (targetView === 'details' ? (selectedNovelId || currentNovel?.id) : null);
          window.history.pushState({ view: targetView, novelId: stateNovelId }, '', window.location.pathname);
        }
      } catch (_) {}

      safeScrollToTop('instant');
    });
  };

  // Listen to browser Back/Forward navigation (popstate)
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state && event.state.view) {
        executeViewTransition(() => {
          setView(event.state.view);
          if (event.state.novelId) {
            setSelectedNovelId(event.state.novelId);
          }
          setShowRoster(false);
        });
      } else {
        executeViewTransition(() => {
          setView('catalog');
          setSelectedNovelId(null);
          setShowRoster(false);
        });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch model status on mount
  useEffect(() => {
    api.status.models().then(setModelStatus).catch(() => {});
  }, []);

  // Open novel details with view transition
  const handleSelectNovel = (novelId) => {
    setShowRoster(false);
    handleNavigate('details', novelId);
  };

  // Open chapter in Reader with view transition
  const handleSelectChapter = async (novel, chapter) => {
    executeViewTransition(() => {
      setCurrentNovel(novel);
      if (novel?.id) {
        setSelectedNovelId(novel.id);
      }
      setCurrentChapter(chapter);
      setView('reader');
      setIsLoadingChapter(true);
      setChapterError(null);
      setChapterSegments(EMPTY_ARRAY);
      setChapterManifest(null);

      try {
        if (typeof window !== 'undefined' && window.history) {
          window.history.pushState(
            { view: 'reader', novelId: novel?.id, chapterId: chapter?.id },
            '',
            window.location.pathname
          );
        }
      } catch (_) {}

      safeScrollToTop('instant');
    });

    try {
      // 1. Fetch chapter details & segments
      const details = await api.chapters.get(chapter.id);
      let segments = details.segments || [];
      if (segments.length === 0 && (details.status === 'draft' || chapter?.status === 'draft' || !details.status)) {
        try {
          const parsedRes = await api.chapters.parse(chapter.id);
          if (parsedRes?.segments) {
            segments = parsedRes.segments;
          }
        } catch (_) {}
      }
      setChapterSegments(segments);

      // 2. Determine manifest and audio stream URL
      let manifest = details.manifest || null;
      if (!manifest) {
        try {
          manifest = await api.chapters.getManifest(chapter.id);
        } catch (_) {}
      }

      if (manifest) {
        const streamUrl =
          manifest.audio_url ||
          manifest.audio_stream_url ||
          `/api/stream/${chapter.id}`;
        setChapterManifest({
          ...manifest,
          audio_stream_url: streamUrl,
        });
      } else {
        setChapterManifest({
          audio_stream_url: `/api/stream/${chapter.id}`,
          total_duration_ms: chapter.total_duration_ms || 0,
          timeline: segments.map((s, idx) => ({
            order: s.order || idx + 1,
            segment_id: s.segment_id !== undefined ? s.segment_id : idx + 1,
            start_ms: s.start_ms || 0,
            end_ms: s.end_ms || 0,
            character_id: s.character_id,
            voice_id: s.voice_id || 'en-GB-RyanNeural',
          })),
        });
      }
    } catch (err) {
      setChapterError(err.message || 'Failed to load chapter audio and segments.');
    } finally {
      setIsLoadingChapter(false);
    }
  };

  const handleOpenAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  // Trigger re-synthesis of chapter
  const handleSynthesizeCurrentChapter = async () => {
    if (!currentChapter?.id) return;
    try {
      if (chapterSegments.length === 0) {
        const parsedRes = await api.chapters.parse(currentChapter.id);
        if (parsedRes?.segments) {
          setChapterSegments(parsedRes.segments);
        }
      }
      const synthRes = await api.chapters.synthesize(currentChapter.id);
      const manifest = synthRes?.manifest || synthRes;
      if (manifest && (manifest.timeline || manifest.audio_url || manifest.total_duration_ms)) {
        setChapterManifest({
          ...manifest,
          audio_stream_url: `${manifest.audio_url || `/api/stream/${currentChapter.id}`}?t=${Date.now()}`,
        });
      }
      try {
        const refreshed = await api.chapters.get(currentChapter.id);
        if (refreshed?.segments) {
          setChapterSegments(refreshed.segments);
        }
      } catch (_) {}
    } catch (err) {
      setChapterError(err.message || 'Failed to trigger chapter synthesis.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] flex flex-col font-sans transition-colors duration-200">
      {/* Editorial 72px Navigation Rail (Desktop) & Bottom Bar (Mobile) */}
      <SidebarNav
        currentView={view}
        onNavigate={(targetView) => handleNavigate(targetView)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAuth={handleOpenAuth}
        onOpenAddNovel={() => setShowAddNovelModal(true)}
      />

      {/* Main Viewport Container (Offset by 72px desktop rail) */}
      <div className="flex-1 md:pl-[72px] flex flex-col min-h-screen">
        {/* Top Sticky Header (Breadcrumbs, Search & Cast Controls for Details/Reader) */}
        {view !== 'catalog' && (
          <TopHeader
            view={view}
            currentNovel={currentNovel}
            currentChapter={currentChapter}
            onNavigate={(targetView) => handleNavigate(targetView)}
            showRoster={showRoster}
            onToggleRoster={() => setShowRoster((prev) => !prev)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAuth={handleOpenAuth}
          />
        )}

        {/* Content Body Area */}
        <main key={view} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 motion-view-route">
          {/* Playback Resume Toast */}
          {view === 'reader' && playbackProgress.resumedAtMs !== null && (
            <div className="mb-4 p-3.5 rounded-2xl bg-[var(--accent)] text-white shadow-xl flex items-center justify-between text-xs animate-slideDown">
              <div className="flex items-center gap-2.5">
                <IconClock className="w-4 h-4" />
                <span>
                  Resumed playback from previous session at{' '}
                  <strong>
                    {Math.floor(playbackProgress.resumedAtMs / 60000)}:
                    {Math.floor((playbackProgress.resumedAtMs % 60000) / 1000)
                      .toString()
                      .padStart(2, '0')}
                  </strong>
                  .
                </span>
              </div>
              <button
                onClick={playbackProgress.dismissResumeBanner}
                className="hover:opacity-80 p-1"
                aria-label="Dismiss resume notification"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Synthesis Progress Banner */}
          {view === 'reader' && synthesisProgress.status !== 'idle' && (
            <div className="mb-6">
              <SynthesisProgressBar
                status={synthesisProgress.status}
                percentComplete={synthesisProgress.percentComplete}
                currentSegment={synthesisProgress.currentSegment}
                totalSegments={synthesisProgress.totalSegments}
                message={synthesisProgress.message}
                error={synthesisProgress.error}
                isConnected={synthesisProgress.isConnected}
                onDismiss={synthesisProgress.reset}
              />
            </div>
          )}

          {/* VIEW 1: NOVEL CATALOG */}
          {view === 'catalog' && (
            <NovelCatalog
              onSelectNovel={handleSelectNovel}
              onSelectChapter={handleSelectChapter}
              onOpenAddNovel={() => setShowAddNovelModal(true)}
              onOpenSettings={() => setShowSettings(true)}
              onOpenAuth={handleOpenAuth}
              onToggleRoster={() => setShowRoster((prev) => !prev)}
            />
          )}

          {/* VIEW 2: NOVEL DETAILS */}
          {view === 'details' && (selectedNovelId || currentNovel?.id) && (
            <NovelDetails
              novelId={selectedNovelId || currentNovel?.id}
              onBack={() => handleNavigate('catalog')}
              onSelectChapter={handleSelectChapter}
              onOpenUploadChapter={(novel) => {
                setCurrentNovel(novel);
                setShowUploadChapterModal(true);
              }}
            />
          )}

          {/* VIEW 3: 60FPS SYNCHRONIZED READER */}
          {view === 'reader' && (
            <div className="space-y-6">
              {/* Chapter Error State */}
              {chapterError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {chapterError}
                </div>
              )}

              {/* Chapter Loading Skeleton */}
              {isLoadingChapter ? (
                <div className="rounded-2xl theme-surface border p-12 text-center theme-muted text-sm animate-pulse space-y-3 max-w-3xl mx-auto">
                  <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin mx-auto" />
                  <p>Loading chapter prose and synchronized timeline...</p>
                </div>
              ) : (
                <ReaderView
                  segments={chapterSegments}
                  activeSegmentId={audioSync.activeSegmentId}
                  isPlaying={audioSync.isPlaying}
                  onSegmentClick={(segmentId) => {
                    audioSync.seekToSegment(segmentId);
                  }}
                  currentNovel={currentNovel}
                  currentChapter={currentChapter}
                  onBack={() => {
                    if (selectedNovelId || currentNovel?.id) {
                      handleNavigate('details', selectedNovelId || currentNovel?.id);
                    } else {
                      handleNavigate('catalog');
                    }
                  }}
                />
              )}
            </div>
          )}
        </main>

        {/* Docked Sticky Bottom Audio Player */}
        {view === 'reader' && chapterManifest && (
          <AudioPlayer
            audioRef={audioSync.audioRef}
            audioUrl={chapterManifest.audio_stream_url}
            isPlaying={audioSync.isPlaying}
            currentTimeMs={audioSync.currentTimeMs}
            totalDurationMs={chapterManifest.total_duration_ms || currentChapter?.total_duration_ms || 0}
            onToggle={audioSync.toggle}
            onSetPlaybackRate={audioSync.setPlaybackRate}
            onSeek={audioSync.seekToTimeMs}
            onPlay={audioSync.handlePlay}
            onPause={audioSync.handlePause}
            onEnded={audioSync.handleEnded}
            onLoadedMetadata={audioSync.handleLoadedMetadata}
            currentNovel={currentNovel}
            currentChapter={currentChapter}
            onSeekSegment={(dir) => {
              const currentIdx = chapterSegments.findIndex(
                (s) => (s.segment_id ?? s.order) === audioSync.activeSegmentId
              );
              const targetIdx = Math.max(0, Math.min(chapterSegments.length - 1, (currentIdx >= 0 ? currentIdx : 0) + dir));
              const targetSeg = chapterSegments[targetIdx];
              if (targetSeg) {
                audioSync.seekToSegment(targetSeg.segment_id ?? targetSeg.order);
              }
            }}
          />
        )}

        {/* Character Cast Roster Drawer */}
        {showRoster && (
          <CharacterRoster
            chapterId={currentChapter?.id || ''}
            segments={chapterSegments}
            onClose={() => setShowRoster(false)}
            onVoiceChange={(charId, newVoiceId) => {
              setChapterSegments((prev) =>
                prev.map((s) =>
                  s.character_id === charId || s.speaker_id === charId
                    ? { ...s, assigned_voice_id: newVoiceId, voice_id: newVoiceId }
                    : s
                )
              );
            }}
          />
        )}

        {/* Auth Modal (Login / Register) */}
        <AuthModal
          isOpen={showAuthModal}
          initialMode={authMode}
          onClose={() => setShowAuthModal(false)}
        />

        {/* Add Novel Modal (Writer / Admin Role Gated) */}
        <AddNovelModal
          isOpen={showAddNovelModal}
          onClose={() => setShowAddNovelModal(false)}
          onOpenAuth={handleOpenAuth}
          onNovelCreated={(newNovel) => {
            handleNavigate('details', newNovel.id);
          }}
        />

        {/* Upload Chapter Modal */}
        <UploadChapterModal
          isOpen={showUploadChapterModal}
          novel={currentNovel}
          onClose={() => setShowUploadChapterModal(false)}
          onChapterUploaded={(newChapter) => {
            handleSelectChapter(currentNovel, newChapter);
          }}
        />

        {/* Neural Engine Settings Modal */}
        {showSettings && (
          <SettingsModal
            modelStatus={modelStatus}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}
