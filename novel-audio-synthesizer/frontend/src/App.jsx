import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import {
  BrowserRouter,
  useInRouterContext,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAudioSync } from './hooks/useAudioSync';
import { usePlaybackProgress } from './hooks/usePlaybackProgress';
import { useSynthesisProgress } from './hooks/useSynthesisProgress';
import { api } from './services/api';

import SidebarNav from './components/SidebarNav';
import TopHeader from './components/TopHeader';
import NovelCatalog from './components/NovelCatalog';
import UploadView from './components/UploadView';
import VoicesView from './components/VoicesView';
import ErrorBoundary from './components/ErrorBoundary';
import { IconClock, IconX } from './components/icons';
import { executeViewTransition } from './tokens/motion';

// Resilient chunk loader with automatic 1-retry fallback
function lazyWithRetry(componentImport) {
  return React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn('[SyncTone] Retrying chunk import...', error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return await componentImport();
    }
  });
}

// Lazy route-level views
const NovelDetails = lazyWithRetry(() => import('./components/NovelDetails'));
const ReaderView = lazyWithRetry(() => import('./components/ReaderView'));
const ProfileView = lazyWithRetry(() => import('./components/ProfileView'));
const AdminView = lazyWithRetry(() => import('./components/AdminView'));
const AudioPlayer = lazyWithRetry(() => import('./components/AudioPlayer'));
const SynthesisProgressBar = lazyWithRetry(() => import('./components/SynthesisProgressBar'));

// Lazy modals
const AuthModal = lazyWithRetry(() => import('./components/AuthModal'));
const AddNovelModal = lazyWithRetry(() => import('./components/AddNovelModal'));
const UploadChapterModal = lazyWithRetry(() => import('./components/UploadChapterModal'));
const SettingsModal = lazyWithRetry(() => import('./components/SettingsModal'));
const CharacterRoster = lazyWithRetry(() => import('./components/CharacterRoster'));

// Route & modal preloader triggers for hover/focus/pointerdown
export const preloadNovelDetails = () => import('./components/NovelDetails');
export const preloadReaderView = () => import('./components/ReaderView');
export const preloadAuthModal = () => import('./components/AuthModal');
export const preloadAddNovelModal = () => import('./components/AddNovelModal');
export const preloadUploadChapterModal = () => import('./components/UploadChapterModal');
export const preloadSettingsModal = () => import('./components/SettingsModal');
export const preloadCharacterRoster = () => import('./components/CharacterRoster');

const EMPTY_ARRAY = [];

function RouteSkeleton() {
  return (
    <div className="w-full flex-1 min-h-[50vh] bg-[var(--bg-page)]" aria-busy="true" />
  );
}

function ModalSkeleton() {
  return null;
}

function SimError() {
  throw new Error('Simulated system fault for visual audit');
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, isAuthenticated, isWriterOrAdmin } = useAuth();

  // Selected Novel & Chapter state
  const [selectedNovelId, setSelectedNovelId] = useState(null);
  const [currentNovel, setCurrentNovel] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);

  // Chapter prose and manifest data
  const [chapterSegments, setChapterSegments] = useState(EMPTY_ARRAY);
  const [chapterManifest, setChapterManifest] = useState(null);
  const [novelCharacters, setNovelCharacters] = useState(EMPTY_ARRAY);
  const [hasStudioAudio, setHasStudioAudio] = useState(false);
  const [novelChapters, setNovelChapters] = useState(EMPTY_ARRAY);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState(null);

  // Modals state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showAddNovelModal, setShowAddNovelModal] = useState(false);
  const [showUploadChapterModal, setShowUploadChapterModal] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);
  const [useTtsSanitizer, setUseTtsSanitizer] = useState(false);
  const [isFollowingAlong, setIsFollowingAlong] = useState(true);
  const [defaultParserEngine, setDefaultParserEngine] = useState(() => {
    try {
      return localStorage.getItem('synctone_parser_engine') || 'heuristic';
    } catch (_) {
      return 'heuristic';
    }
  });

  const handleSelectParserEngine = useCallback((engine) => {
    setDefaultParserEngine(engine);
    try {
      localStorage.setItem('synctone_parser_engine', engine);
    } catch (_) {}
  }, []);

  const handleProbeStatus = useCallback(async () => {
    try {
      const res = await api.status.models({ probe: true });
      if (res) setModelStatus(res);
      return res;
    } catch (_) {
      return null;
    }
  }, []);

  // Sanitized timeline when TTS Clean is active
  const [sanitizedTimeline, setSanitizedTimeline] = useState(null);
  useEffect(() => {
    if (!useTtsSanitizer || !chapterManifest?.timeline) {
      setSanitizedTimeline(null);
      return;
    }
    let cancelled = false;
    import('./utils/ttsSanitizer').then(({ sanitizeSegmentsWithTtsDomCleaner }) => {
      if (!cancelled) {
        setSanitizedTimeline(sanitizeSegmentsWithTtsDomCleaner(chapterManifest.timeline));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chapterManifest?.timeline, useTtsSanitizer]);

  const effectiveTimeline = useMemo(() => {
    if (useTtsSanitizer && sanitizedTimeline) return sanitizedTimeline;
    return chapterManifest?.timeline ?? EMPTY_ARRAY;
  }, [chapterManifest?.timeline, useTtsSanitizer, sanitizedTimeline]);

  // Audio Synchronization Hook with chapter auto-advance callback
  const onChapterEndedRef = useRef(null);
  const handleChapterEnded = useCallback(() => {
    onChapterEndedRef.current?.();
  }, []);

  const audioSync = useAudioSync(effectiveTimeline, {
    onChapterEnded: handleChapterEnded,
    novelId: currentNovel?.id || selectedNovelId,
    chapterId: currentChapter?.id,
    characters: novelCharacters,
  });

  // Playback Progress Hook (auto-resume & throttled persistence)
  const playbackProgress = usePlaybackProgress({
    novelId: currentNovel?.id,
    chapterId: currentChapter?.id,
    user,
    audioSync,
    timeline: effectiveTimeline,
  });

  // Real-time WebSocket Synthesis Progress Hook
  const synthesisProgress = useSynthesisProgress(currentChapter?.id);

  // Fetch TTS / LLM model engine status when settings is opened or on mount
  useEffect(() => {
    api.status.models().then(setModelStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (showSettings) {
      api.status
        .models()
        .then((res) => setModelStatus(res))
        .catch(() => {});
    }
  }, [showSettings]);

  // Derive current view from location.pathname
  const pathname = location.pathname;
  let view = 'catalog';
  let routeNovelId = null;
  let routeChapterId = null;

  if (pathname.startsWith('/novel/') || pathname.startsWith('/novels/')) {
    view = 'details';
    routeNovelId = pathname.replace(/^\/novels?\//, '').split('/')[0];
  } else if (pathname.startsWith('/reader/') || pathname === '/reader') {
    view = 'reader';
    routeChapterId = pathname.startsWith('/reader/') ? pathname.replace('/reader/', '').split('/')[0] : null;
  } else if (pathname === '/voices' || pathname === '/voice-studio') {
    view = 'voices';
  } else if (pathname === '/archive' || pathname === '/community') {
    view = 'archive';
  } else if (pathname === '/upload' || pathname === '/studio' || pathname === '/upload-studio') {
    view = 'upload';
  } else if (pathname === '/profile') {
    view = 'profile';
  } else if (pathname === '/admin') {
    view = 'admin';
  } else if (pathname === '/settings') {
    view = 'catalog';
  } else if (pathname.startsWith('/test/')) {
    view = 'test';
  }

  // Safe scroll helper
  const safeScrollToTop = (behavior = 'instant') => {
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior });
      }
    } catch (_) {}
  };

  // Centralized navigation handler with real routing
  const handleNavigate = useCallback((targetView, paramId = null) => {
    executeViewTransition(() => {
      setShowRoster(false);
      safeScrollToTop('instant');

      if (targetView === 'catalog' || targetView === 'library') {
        setSelectedNovelId(null);
        navigate('/');
      } else if (targetView === 'archive') {
        navigate('/archive');
      } else if (targetView === 'voices') {
        navigate('/voices');
      } else if (targetView === 'details') {
        const id = paramId || selectedNovelId || currentNovel?.id;
        if (id) {
          setSelectedNovelId(id);
          navigate(`/novel/${id}`);
        } else {
          navigate('/');
        }
      } else if (targetView === 'reader') {
        const chId = paramId || currentChapter?.id;
        if (chId) {
          navigate(`/reader/${chId}`);
        } else {
          navigate('/reader');
        }
      } else if (targetView === 'upload' || targetView === 'studio' || targetView === 'upload-studio') {
        navigate('/upload');
      } else if (targetView === 'profile') {
        navigate('/profile');
      } else if (targetView === 'admin') {
        navigate('/admin');
      } else if (targetView === 'settings') {
        setShowSettings(true);
        navigate('/settings');
      }
    });
  }, [navigate, selectedNovelId, currentNovel?.id, currentChapter?.id]);

  // Sync /settings route with settings modal and deep-link modal triggers
  useEffect(() => {
    if (pathname === '/settings') {
      setShowSettings(true);
    }
    const params = new URLSearchParams(location.search);
    const modal = params.get('modal');
    if (modal === 'auth' || params.has('auth')) {
      setAuthMode(params.get('auth') === 'register' ? 'register' : 'login');
      setShowAuthModal(true);
    } else if (modal === 'add-novel') {
      setShowAddNovelModal(true);
    } else if (modal === 'upload-chapter') {
      setShowUploadChapterModal(true);
    } else if (modal === 'settings') {
      setShowSettings(true);
    } else if (modal === 'roster') {
      setShowRoster(true);
    }
  }, [pathname, location.search]);

  // Auto-close character roster when navigating outside reader view
  useEffect(() => {
    if (view !== 'reader' && showRoster) {
      setShowRoster(false);
    }
  }, [view, showRoster]);

  // Sync routeNovelId with selectedNovelId
  useEffect(() => {
    if (view === 'details') {
      if (routeNovelId && routeNovelId !== selectedNovelId) {
        setSelectedNovelId(routeNovelId);
      } else if (!routeNovelId && !selectedNovelId && !currentNovel?.id) {
        navigate('/');
      }
    }
  }, [view, routeNovelId, selectedNovelId, currentNovel?.id, navigate]);

  const matchesCharacterTarget = useCallback((item, targetCharId) => {
    if (!item || !targetCharId) return false;
    const normTarget = String(targetCharId).trim().toLowerCase();
    const candidates = [
      item.character_id,
      item.speaker_id,
      item.id,
      item.name,
      item.speaker_name,
    ]
      .filter(Boolean)
      .map((val) => String(val).trim().toLowerCase());
    return candidates.includes(normTarget);
  }, []);

  const mergeNovelCharacters = useCallback((existingList = [], incomingList = []) => {
    const existingArr = Array.isArray(existingList) ? existingList : [];
    const incomingArr = Array.isArray(incomingList) ? incomingList : [];

    const existingMap = new Map();
    existingArr.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      [c.character_id, c.speaker_id, c.id, c.name, c.speaker_name]
        .filter(Boolean)
        .forEach((k) => {
          existingMap.set(String(k).trim().toLowerCase(), c);
        });
    });

    const merged = [];
    const seenKeys = new Set();
    const registerKeys = (c) => {
      [c.character_id, c.speaker_id, c.id, c.name, c.speaker_name]
        .filter(Boolean)
        .forEach((k) => seenKeys.add(String(k).trim().toLowerCase()));
    };

    incomingArr.forEach((char) => {
      if (!char || typeof char !== 'object') return;
      const keys = [char.character_id, char.speaker_id, char.id, char.name, char.speaker_name]
        .filter(Boolean)
        .map((k) => String(k).trim().toLowerCase());
      let match = null;
      for (const k of keys) {
        if (existingMap.has(k)) {
          match = existingMap.get(k);
          break;
        }
      }

      const incomingVoice =
        char.voice_id && String(char.voice_id).trim() !== ''
          ? char.voice_id
          : char.assigned_voice_id && String(char.assigned_voice_id).trim() !== ''
            ? char.assigned_voice_id
            : null;
      const existingVoice =
        match?.voice_id && String(match.voice_id).trim() !== ''
          ? match.voice_id
          : match?.assigned_voice_id && String(match.assigned_voice_id).trim() !== ''
            ? match.assigned_voice_id
            : null;
      const resolvedVoiceId =
        incomingVoice || existingVoice || (keys.includes('narrator') ? 'en-GB-RyanNeural' : null);
      const resolvedAssignedVoice =
        (char.assigned_voice_id && String(char.assigned_voice_id).trim() !== ''
          ? char.assigned_voice_id
          : null) ||
        (match?.assigned_voice_id && String(match.assigned_voice_id).trim() !== ''
          ? match.assigned_voice_id
          : null) ||
        resolvedVoiceId;

      const entry = {
        ...(match || {}),
        ...char,
        voice_id: resolvedVoiceId,
        ...(resolvedAssignedVoice ? { assigned_voice_id: resolvedAssignedVoice } : {}),
      };
      registerKeys(entry);
      merged.push(entry);
    });

    if (!seenKeys.has('narrator')) {
      const existingNarrator = existingMap.get('narrator');
      const narratorVoice =
        (existingNarrator?.voice_id && String(existingNarrator.voice_id).trim() !== ''
          ? existingNarrator.voice_id
          : null) ||
        (existingNarrator?.assigned_voice_id && String(existingNarrator.assigned_voice_id).trim() !== ''
          ? existingNarrator.assigned_voice_id
          : null) ||
        'en-GB-RyanNeural';
      merged.unshift({
        ...(existingNarrator || {}),
        id: existingNarrator?.id || 'narrator',
        character_id: existingNarrator?.character_id || 'narrator',
        name: existingNarrator?.name || 'Narrator',
        voice_id: narratorVoice,
        assigned_voice_id: existingNarrator?.assigned_voice_id || narratorVoice,
      });
    }

    return merged;
  }, []);

  const buildChapterManifestState = useCallback((chapterId, details, segments, manifest) => {
    if (manifest) {
      const streamUrl =
        manifest.audio_url ||
        manifest.audio_stream_url ||
        `/api/stream/${chapterId}`;
      const enrichedTimeline = (manifest.timeline || []).map((t, idx) => {
        const seg =
          segments.find(
            (s) =>
              (s.segment_id !== undefined ? s.segment_id : s.order) ===
              (t.segment_id !== undefined ? t.segment_id : t.order)
          ) || segments[idx];
        return {
          ...t,
          text: t.text || seg?.text || '',
          speaker_name: t.speaker_name || seg?.speaker_name || '',
          voice_id: t.voice_id || seg?.voice_id || seg?.assigned_voice_id || 'en-GB-RyanNeural',
          assigned_voice_id: t.assigned_voice_id || seg?.assigned_voice_id || t.voice_id || seg?.voice_id,
          character_id: t.character_id || seg?.character_id || seg?.speaker_id || 'narrator',
          type: t.type || seg?.type || 'narration',
          gender: t.gender || seg?.gender,
          cast_slot: t.cast_slot ?? seg?.cast_slot ?? seg?.slot,
        };
      });
      return {
        ...manifest,
        audio_stream_url: streamUrl,
        timeline: enrichedTimeline,
      };
    }

    return {
      audio_stream_url: `/api/stream/${chapterId}`,
      total_duration_ms: details?.total_duration_ms || 0,
      timeline: (segments || []).map((s, idx) => ({
        order: s.order || idx + 1,
        segment_id: s.segment_id !== undefined ? s.segment_id : idx + 1,
        start_ms: s.start_ms || 0,
        end_ms: s.end_ms || 0,
        character_id: s.character_id || s.speaker_id || 'narrator',
        voice_id: s.voice_id || s.assigned_voice_id || 'en-GB-RyanNeural',
        assigned_voice_id: s.assigned_voice_id || s.voice_id,
        text: s.text || '',
        speaker_name: s.speaker_name || '',
        type: s.type || 'narration',
        gender: s.gender,
        cast_slot: s.cast_slot ?? s.slot,
      })),
    };
  }, []);

  // Load chapter helper (used for route navigation and deep links)
  const loadChapterById = useCallback(async (chapterId, novel = null) => {
    setIsLoadingChapter(true);
    setChapterError(null);
    setChapterSegments(EMPTY_ARRAY);
    setChapterManifest(null);

    try {
      let resolvedCharacters = Array.isArray(novel?.characters) ? novel.characters : null;

      // 0. Fetch novel chapter list for Next Chapter navigation
      if (novel?.id) {
        api.novels
          .get(novel.id)
          .then((nData) => {
            if (Array.isArray(nData?.chapters)) {
              setNovelChapters(nData.chapters);
            }
            if (Array.isArray(nData?.characters)) {
              setNovelCharacters((prev) => (prev.length > 0 ? prev : nData.characters));
            }
          })
          .catch(() => {});
      }

      const details = await api.chapters.get(chapterId);
      setCurrentChapter((prev) => ({ ...(prev || {}), ...details }));
      const studioReady = Boolean(details.has_studio_audio);
      setHasStudioAudio(studioReady);
      if (!studioReady && audioSync.playbackMode === 'studio') {
        audioSync.togglePlaybackMode('tts');
      }

      if (Array.isArray(details?.characters)) {
        resolvedCharacters = details.characters;
      }

      if (!novel && details.novel_id) {
        try {
          const fetchedNovel = await api.novels.get(details.novel_id);
          setCurrentNovel(fetchedNovel);
          setSelectedNovelId(fetchedNovel.id);
          if (Array.isArray(fetchedNovel?.chapters)) {
            setNovelChapters(fetchedNovel.chapters);
          }
          if (!resolvedCharacters && Array.isArray(fetchedNovel?.characters)) {
            resolvedCharacters = fetchedNovel.characters;
          }
        } catch (_) {}
      } else if (novel) {
        setCurrentNovel(novel);
        setSelectedNovelId(novel.id);
      }

      if (resolvedCharacters) {
        setNovelCharacters((prev) => mergeNovelCharacters(prev, resolvedCharacters));
      } else {
        setNovelCharacters(EMPTY_ARRAY);
      }

      let segments = details.segments || [];
      if (segments.length === 0 && (details.status === 'draft' || !details.status)) {
        try {
          const parsedRes = await api.chapters.parse(chapterId);
          if (parsedRes?.segments) {
            segments = parsedRes.segments;
          }
          if (Array.isArray(parsedRes?.characters)) {
            setNovelCharacters((prev) => mergeNovelCharacters(prev, parsedRes.characters));
          }
        } catch (_) {}
      }
      setChapterSegments(segments);

      let manifest = details.manifest || null;
      if (!manifest) {
        try {
          manifest = await api.chapters.getManifest(chapterId);
        } catch (_) {}
      }

      setChapterManifest(buildChapterManifestState(chapterId, details, segments, manifest));
    } catch (err) {
      setChapterError(err.message || 'Failed to load chapter audio and segments.');
    } finally {
      setIsLoadingChapter(false);
    }
  }, [buildChapterManifestState, mergeNovelCharacters]);

  const handleReparseCurrentChapter = useCallback(
    async (parserEngine = defaultParserEngine, parserConfig = null) => {
      const targetChapterId = currentChapter?.id;
      if (!targetChapterId) return null;

      const parsedRes = await api.chapters.parse(targetChapterId, parserEngine, parserConfig);
      let refreshedDetails = null;
      try {
        refreshedDetails = await api.chapters.get(targetChapterId);
      } catch (_) {}

      const nextSegments =
        Array.isArray(refreshedDetails?.segments) && refreshedDetails.segments.length > 0
          ? refreshedDetails.segments
          : Array.isArray(parsedRes?.segments)
            ? parsedRes.segments
            : [];
      const nextManifest = refreshedDetails?.manifest || parsedRes?.manifest || null;
      const nextCharacters =
        (Array.isArray(refreshedDetails?.characters) && refreshedDetails.characters) ||
        (Array.isArray(parsedRes?.characters) && parsedRes.characters) ||
        null;

      setChapterSegments(nextSegments);
      setChapterManifest(
        buildChapterManifestState(
          targetChapterId,
          refreshedDetails || parsedRes || currentChapter,
          nextSegments,
          nextManifest
        )
      );

      if (nextCharacters) {
        setNovelCharacters((prev) => mergeNovelCharacters(prev, nextCharacters));
      } else if (nextSegments.length > 0) {
        const derivedMap = new Map();
        nextSegments.forEach((seg) => {
          const charId = seg.character_id || seg.speaker_id;
          if (!charId) return;
          if (!derivedMap.has(charId)) {
            derivedMap.set(charId, {
              id: charId,
              character_id: charId,
              name: seg.speaker_name || charId,
              voice_id: seg.assigned_voice_id || seg.voice_id || null,
              gender: seg.gender || null,
            });
          }
        });
        setNovelCharacters((prev) => mergeNovelCharacters(prev, Array.from(derivedMap.values())));
      }

      if (refreshedDetails) {
        setCurrentChapter((prev) => ({ ...(prev || {}), ...refreshedDetails }));
      }

      return {
        segments: nextSegments,
        characters: nextCharacters || [],
        manifest: nextManifest,
      };
    },
    [currentChapter, defaultParserEngine, buildChapterManifestState, mergeNovelCharacters]
  );

  // Sync routeChapterId when navigating deep link to /reader/:chapterId
  useEffect(() => {
    if (view === 'reader' && routeChapterId) {
      if (currentChapter?.id !== routeChapterId || chapterSegments.length === 0) {
        loadChapterById(routeChapterId, currentNovel);
      }
    }
  }, [view, routeChapterId, currentChapter?.id, currentNovel, chapterSegments.length, loadChapterById]);

  // Open novel details
  const handleSelectNovel = (novelId) => {
    setShowRoster(false);
    handleNavigate('details', novelId);
  };

  // Open chapter in Reader
  const handleSelectChapter = useCallback(async (novel, chapter) => {
    executeViewTransition(() => {
      setCurrentNovel(novel);
      if (novel?.id) {
        setSelectedNovelId(novel.id);
      }
      setCurrentChapter(chapter);
      safeScrollToTop('instant');
      navigate(`/reader/${chapter.id}`);
    });
    loadChapterById(chapter.id, novel);
  }, [loadChapterById, navigate]);

  // Auto-resolve chapter when user navigates directly to /reader without chapter ID
  useEffect(() => {
    if (view === 'reader' && !routeChapterId && !isLoadingChapter) {
      if (currentChapter?.id) {
        navigate(`/reader/${currentChapter.id}`, { replace: true });
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const targetNovelId = currentNovel?.id || selectedNovelId;
          if (targetNovelId) {
            const nData = await api.novels.get(targetNovelId);
            const ch1 = (nData.chapters || []).find((c) => c.chapter_number === 1) || nData.chapters?.[0];
            if (ch1 && !cancelled) {
              handleSelectChapter(nData.novel || currentNovel || { id: targetNovelId }, ch1);
              return;
            }
          }
          const list = await api.novels.list();
          const candidate = (list.novels || []).find((n) => n.chapter_count > 0) || list.novels?.[0];
          if (candidate && !cancelled) {
            const nData = await api.novels.get(candidate.id);
            const ch1 = (nData.chapters || []).find((c) => c.chapter_number === 1) || nData.chapters?.[0];
            if (ch1 && !cancelled) {
              handleSelectChapter(candidate, ch1);
              return;
            }
          }
        } catch (_) {}
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [view, routeChapterId, currentChapter, currentNovel, selectedNovelId, isLoadingChapter, navigate, handleSelectChapter]);

  // Auto-advance to next chapter when current chapter completes
  useEffect(() => {
    onChapterEndedRef.current = () => {
      if (!currentChapter || novelChapters.length === 0) return;
      const idx = novelChapters.findIndex((c) => c.id === currentChapter.id);
      const nextCh =
        idx >= 0 && idx + 1 < novelChapters.length
          ? novelChapters[idx + 1]
          : novelChapters.find(
              (c) => Number(c.chapter_number) === Number(currentChapter.chapter_number) + 1
            );
      if (nextCh) {
        handleSelectChapter(currentNovel, nextCh);
      }
    };
  }, [currentChapter, novelChapters, currentNovel, handleSelectChapter]);

  // Seamless Archive Navigation: opens catalog and scrolls directly to library shelves
  const handleOpenArchive = useCallback(() => {
    const scrollToArchive = () => {
      const el = document.getElementById('archive-catalog') || document.querySelector('.volume-card') || document.querySelector('input[aria-label="Search novels"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    if (view === 'catalog') {
      if (!scrollToArchive()) {
        setTimeout(scrollToArchive, 100);
        setTimeout(scrollToArchive, 300);
      }
    } else {
      handleNavigate('catalog');
      setTimeout(scrollToArchive, 100);
      setTimeout(scrollToArchive, 300);
      setTimeout(scrollToArchive, 600);
    }
  }, [view, handleNavigate]);

  // Seamless Reader Launch: opens current chapter, or novel chapter 1, or flagship novel chapter 1
  const handleOpenReaderQuick = useCallback(async () => {
    if (currentChapter?.id) {
      handleNavigate('reader', currentChapter.id);
      return;
    }
    const targetNovelId = currentNovel?.id || selectedNovelId || routeNovelId;
    if (targetNovelId) {
      try {
        const nData = await api.novels.get(targetNovelId);
        const ch1 = (nData.chapters || []).find((c) => c.chapter_number === 1) || nData.chapters?.[0];
        if (ch1) {
          handleSelectChapter(nData.novel || currentNovel || { id: targetNovelId }, ch1);
          return;
        }
      } catch (_) {}
    }
    // Launch flagship volume with active audio
    try {
      const data = await api.novels.list();
      const targetNovel = (data.novels || []).find((n) => n.chapter_count > 0) || data.novels?.[0];
      if (targetNovel) {
        const nData = await api.novels.get(targetNovel.id);
        const ch1 = (nData.chapters || []).find((c) => c.chapter_number === 1) || nData.chapters?.[0];
        if (ch1) {
          handleSelectChapter(targetNovel, ch1);
          return;
        }
        handleNavigate('details', targetNovel.id);
        return;
      }
    } catch (_) {}
    handleNavigate('catalog');
  }, [currentChapter, currentNovel, selectedNovelId, routeNovelId, handleNavigate, handleSelectChapter]);

  // Seamless Voice Studio Launch: opens cast and voices tab
  const handleOpenVoices = useCallback(async () => {
    handleNavigate('voices');
  }, [handleNavigate]);

  const handleOpenAuth = (mode = 'login') => {
    setAuthMode(typeof mode === 'string' ? mode : 'login');
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
      const synthRes = await api.chapters.synthesize(currentChapter.id, audioSync.ttsEngine);
      const manifest = synthRes?.manifest || synthRes;
      if (manifest && (manifest.timeline || manifest.audio_url || manifest.total_duration_ms)) {
        setHasStudioAudio(true);
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
      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-h-screen">
        <TopHeader
          view={view}
          currentNovel={currentNovel}
          currentChapter={currentChapter}
          onNavigate={handleNavigate}
          onOpenArchive={() => handleNavigate('archive')}
          onOpenReader={handleOpenReaderQuick}
          onOpenVoices={() => handleNavigate('voices')}
          showRoster={showRoster}
          onToggleRoster={() => {
            setShowSettings(false);
            setShowAuthModal(false);
            setShowRoster((prev) => !prev);
          }}
          onOpenSettings={() => {
            setShowRoster(false);
            setShowSettings(true);
          }}
          onOpenAuth={(mode) => {
            setShowRoster(false);
            handleOpenAuth(mode);
          }}
          onOpenAddNovel={() => {
            setShowRoster(false);
            setShowAddNovelModal(true);
          }}
        />

          {/* Navigation Rail (Desktop) & Bottom Bar (Mobile) */}
          <SidebarNav
            currentView={view}
            onNavigate={handleNavigate}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAuth={handleOpenAuth}
            onOpenAddNovel={() => setShowAddNovelModal(true)}
          />

          {/* Content Body Area */}
          <main key={view} className={`flex-1 w-full motion-view-route ${view === 'reader' ? 'p-0' : 'px-4 sm:px-8 py-6'}`}>
            {/* Playback Resume Toast */}
            {view === 'reader' && playbackProgress.resumedAtMs !== null && (
              <div className="mx-4 sm:mx-8 mb-4 p-3.5 rounded-2xl bg-[var(--accent)] text-[var(--on-accent)] shadow-xl flex items-center justify-between text-xs animate-slideDown">
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
                  className="p-1.5 rounded-full hover:bg-black/10 transition active:scale-95 cursor-pointer"
                  aria-label="Dismiss resume notification"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Live Synthesis Progress Banner */}
            {view === 'reader' && synthesisProgress.status !== 'idle' && (
              <Suspense fallback={null}>
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
              </Suspense>
            )}

            {/* TEST VIEWS */}
            {pathname === '/test/error-boundary' && (
              <ErrorBoundary friendlyMessage="Simulated system fault for visual audit.">
                <SimError />
              </ErrorBoundary>
            )}

            {pathname === '/test/synthesis-progress' && (
              <div className="p-8 max-w-2xl mx-auto">
                <Suspense fallback={null}>
                  <SynthesisProgressBar
                    status="synthesizing"
                    percentComplete={68}
                    currentSegment={14}
                    totalSegments={20}
                    message="Generating multi-voice chapter audio..."
                    isConnected={true}
                  />
                </Suspense>
              </div>
            )}

            {/* VIEW 1: NOVEL CATALOG (Library - Verified Works) */}
            {view === 'catalog' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load library catalog.">
                <NovelCatalog
                  initialChannel="verified"
                  onSelectNovel={handleSelectNovel}
                  onSelectChapter={handleSelectChapter}
                  onOpenAddNovel={() => setShowAddNovelModal(true)}
                  onOpenSettings={() => setShowSettings(true)}
                  onOpenAuth={handleOpenAuth}
                />
              </ErrorBoundary>
            )}

            {/* VIEW 1B: ARCHIVE CATALOG (Community & Public Domain) */}
            {view === 'archive' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load archive catalog.">
                <NovelCatalog
                  initialChannel="community"
                  onSelectNovel={handleSelectNovel}
                  onSelectChapter={handleSelectChapter}
                  onOpenAddNovel={() => setShowAddNovelModal(true)}
                  onOpenSettings={() => setShowSettings(true)}
                  onOpenAuth={handleOpenAuth}
                />
              </ErrorBoundary>
            )}

            {/* VIEW 1C: VOICE SYNTHESIS STUDIO */}
            {view === 'voices' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load voice synthesis studio.">
                <VoicesView
                  onSelectNovel={handleSelectNovel}
                  onOpenSettings={() => setShowSettings(true)}
                  ttsEngine={audioSync.ttsEngine}
                  onSelectTtsEngine={audioSync.setTtsEngine}
                />
              </ErrorBoundary>
            )}

            {/* VIEW 2: NOVEL DETAILS */}
            {view === 'details' && (selectedNovelId || routeNovelId || currentNovel?.id) && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load novel details.">
                <Suspense fallback={<RouteSkeleton />}>
                  <NovelDetails
                    novelId={selectedNovelId || routeNovelId || currentNovel?.id}
                    onBack={() => handleNavigate('catalog')}
                    onSelectChapter={handleSelectChapter}
                    onOpenUploadChapter={(novel) => {
                      setCurrentNovel(novel);
                      setShowUploadChapterModal(true);
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {/* VIEW 3: SYNCHRONIZED READER */}
            {view === 'reader' && (
              <div className="w-full">
                {chapterError && (
                  <div className="mx-4 my-2 p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-xs">
                    {chapterError}
                  </div>
                )}

                {isLoadingChapter ? (
                  <div className="rounded-2xl theme-surface border theme-border p-12 text-center theme-muted text-sm animate-pulse space-y-3 max-w-3xl mx-auto">
                    <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin mx-auto" />
                    <p>Loading chapter prose and synchronized timeline...</p>
                  </div>
                ) : (
                  <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load the reader. Try opening the chapter again.">
                    <Suspense fallback={<RouteSkeleton />}>
                      <ReaderView
                        segments={chapterSegments}
                        activeSegmentId={audioSync.activeSegmentId}
                        segmentProgress={audioSync.segmentProgress}
                        isPlaying={audioSync.isPlaying}
                        onSegmentClick={(segmentId) => {
                          audioSync.seekToSegment(segmentId);
                        }}
                        currentNovel={currentNovel}
                        currentChapter={currentChapter}
                        chapters={novelChapters}
                        onSelectChapter={(chapterId) => {
                          const targetCh = novelChapters.find((c) => c.id === chapterId);
                          if (targetCh) {
                            handleSelectChapter(currentNovel, targetCh);
                          }
                        }}
                        useTtsSanitizer={useTtsSanitizer}
                        onToggleTtsSanitizer={() => setUseTtsSanitizer((prev) => !prev)}
                        isFollowingAlong={isFollowingAlong}
                        onToggleFollowAlong={(nextVal) =>
                          setIsFollowingAlong((prev) => (typeof nextVal === 'boolean' ? nextVal : !prev))
                        }
                        onRetry={() => {
                          if (currentChapter) {
                            handleSelectChapter(currentNovel, currentChapter);
                          }
                        }}
                        onNextChapter={(() => {
                          if (!currentChapter || novelChapters.length === 0) return null;
                          const idx = novelChapters.findIndex((c) => c.id === currentChapter.id);
                          const nextCh =
                            idx >= 0 && idx + 1 < novelChapters.length
                              ? novelChapters[idx + 1]
                              : novelChapters.find(
                                  (c) => Number(c.chapter_number) === Number(currentChapter.chapter_number) + 1
                                );
                          return nextCh ? () => handleSelectChapter(currentNovel, nextCh) : null;
                        })()}
                        onBack={() => {
                          if (selectedNovelId || currentNovel?.id) {
                            handleNavigate('details', selectedNovelId || currentNovel?.id);
                          } else {
                            handleNavigate('catalog');
                          }
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
            )}

            {/* VIEW 4: UPLOAD VIEW */}
            {view === 'upload' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load upload studio.">
                <UploadView
                  onOpenUploadModal={() => setShowAddNovelModal(true)}
                  onOpenAuth={handleOpenAuth}
                  onNavigate={handleNavigate}
                  onSelectChapter={handleSelectChapter}
                  defaultParserEngine={defaultParserEngine}
                  onSelectParserEngine={handleSelectParserEngine}
                  onNovelCreated={(newNovel, firstChapter) => {
                    if (firstChapter) {
                      handleSelectChapter(newNovel, firstChapter);
                    } else {
                      handleNavigate('details', newNovel.id);
                    }
                  }}
                />
              </ErrorBoundary>
            )}

            {/* VIEW 5: PROFILE VIEW */}
            {view === 'profile' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load profile.">
                <Suspense fallback={<RouteSkeleton />}>
                  <ProfileView
                    onOpenAuth={handleOpenAuth}
                    onNavigateHome={() => handleNavigate('catalog')}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {/* VIEW 6: ADMIN VIEW */}
            {view === 'admin' && (
              <ErrorBoundary resetKey={pathname} friendlyMessage="Couldn't load administration.">
                <Suspense fallback={<RouteSkeleton />}>
                  <AdminView
                    onNavigateHome={() => handleNavigate('catalog')}
                    onOpenSettings={() => setShowSettings(true)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          </main>

          {/* Sticky Bottom Audio Player */}
          {view === 'reader' && chapterManifest && (
            <ErrorBoundary friendlyMessage="Audio player encountered an issue.">
              <Suspense fallback={null}>
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
                  onError={audioSync.handleAudioError}
                  onLoadedMetadata={audioSync.handleLoadedMetadata}
                  currentNovel={currentNovel}
                  currentChapter={currentChapter}
                  playbackMode={audioSync.playbackMode}
                  onTogglePlaybackMode={(mode) => {
                    const explicitMode = mode === 'tts' || mode === 'studio' ? mode : null;
                    const targetMode = explicitMode || (audioSync.playbackMode === 'tts' ? 'studio' : 'tts');
                    if (targetMode === 'studio' && !hasStudioAudio) {
                      handleSynthesizeCurrentChapter()
                        .then(() => {
                          audioSync.togglePlaybackMode('studio');
                        })
                        .catch(() => {});
                      return;
                    }
                    audioSync.togglePlaybackMode(targetMode);
                  }}
                  ttsEngine={audioSync.ttsEngine}
                  onChangeTtsEngine={audioSync.setTtsEngine}
                  isFollowingAlong={isFollowingAlong}
                  onToggleFollowAlong={() => setIsFollowingAlong((prev) => !prev)}
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
              </Suspense>
            </ErrorBoundary>
          )}

          {/* Character Cast Roster Drawer */}
          {showRoster && view === 'reader' && (
            <Suspense fallback={null}>
              <CharacterRoster
                chapterId={currentChapter?.id || ''}
                segments={chapterSegments}
                onClose={() => setShowRoster(false)}
                onVoiceChange={(charId, newVoiceId) => {
                  setChapterSegments((prev) =>
                    prev.map((s) =>
                      matchesCharacterTarget(s, charId)
                        ? { ...s, assigned_voice_id: newVoiceId, voice_id: newVoiceId }
                        : s
                    )
                  );
                  setChapterManifest((prev) =>
                    prev
                      ? {
                          ...prev,
                          timeline: (prev.timeline || []).map((t) =>
                            matchesCharacterTarget(t, charId)
                              ? { ...t, assigned_voice_id: newVoiceId, voice_id: newVoiceId }
                              : t
                          ),
                        }
                      : prev
                  );
                  setNovelCharacters((prev) =>
                    prev.map((c) =>
                      matchesCharacterTarget(c, charId)
                        ? { ...c, assigned_voice_id: newVoiceId, voice_id: newVoiceId }
                        : c
                    )
                  );
                  setCurrentNovel((prev) =>
                    prev && Array.isArray(prev.characters)
                      ? {
                          ...prev,
                          characters: prev.characters.map((c) =>
                            matchesCharacterTarget(c, charId)
                              ? { ...c, assigned_voice_id: newVoiceId, voice_id: newVoiceId }
                              : c
                          ),
                        }
                      : prev
                  );
                }}
              />
            </Suspense>
          )}

          {/* Lazy Modals with Obsidian Skeleton Fallback */}
          {showAuthModal && (
            <Suspense fallback={<ModalSkeleton maxWidth="max-w-3xl" onClose={() => setShowAuthModal(false)} />}>
              <AuthModal
                isOpen={showAuthModal}
                initialMode={authMode}
                onClose={() => setShowAuthModal(false)}
              />
            </Suspense>
          )}

          {showAddNovelModal && (
            <Suspense fallback={<ModalSkeleton maxWidth="max-w-xl" onClose={() => setShowAddNovelModal(false)} />}>
              <AddNovelModal
                isOpen={showAddNovelModal}
                onClose={() => setShowAddNovelModal(false)}
                onOpenAuth={handleOpenAuth}
                onSelectChapter={handleSelectChapter}
                initialParserEngine={defaultParserEngine}
                onNovelCreated={(newNovel, firstChapter) => {
                  if (firstChapter) {
                    handleSelectChapter(newNovel, firstChapter);
                  } else {
                    handleNavigate('details', newNovel.id);
                  }
                }}
              />
            </Suspense>
          )}

          {showUploadChapterModal && (
            <Suspense fallback={<ModalSkeleton maxWidth="max-w-xl" onClose={() => setShowUploadChapterModal(false)} />}>
              <UploadChapterModal
                isOpen={showUploadChapterModal}
                novel={currentNovel}
                onClose={() => setShowUploadChapterModal(false)}
                onChapterUploaded={(newChapter) => {
                  handleSelectChapter(currentNovel, newChapter);
                }}
              />
            </Suspense>
          )}

          {showSettings && (
            <Suspense
              fallback={
                <ModalSkeleton
                  maxWidth="max-w-lg"
                  onClose={() => {
                    setShowSettings(false);
                    if (pathname === '/settings') navigate('/');
                  }}
                />
              }
            >
              <SettingsModal
                modelStatus={modelStatus}
                ttsEngine={audioSync.ttsEngine}
                onSelectTtsEngine={audioSync.setTtsEngine}
                defaultParserEngine={defaultParserEngine}
                onSelectParserEngine={handleSelectParserEngine}
                onProbeStatus={handleProbeStatus}
                currentChapterId={currentChapter?.id || null}
                onReparseChapter={handleReparseCurrentChapter}
                onClose={() => {
                  setShowSettings(false);
                  if (pathname === '/settings') navigate('/');
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
  );
}

export default function App() {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return (
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    );
  }
  return <AppContent />;
}
