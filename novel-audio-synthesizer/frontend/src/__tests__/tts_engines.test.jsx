import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { useAudioSync } from '../hooks/useAudioSync';
import AudioPlayer from '../components/AudioPlayer';
import SettingsModal from '../components/SettingsModal';
import VoicesView from '../components/VoicesView';
import { ThemeProvider } from '../context/ThemeContext';
import { api } from '../services/api';

describe('3-Engine TTS Architecture & UI Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('useAudioSync provides ttsEngine state and setTtsEngine dispatcher defaulting to msedge-tts', () => {
    const { result } = renderHook(() => useAudioSync([]));

    expect(result.current.ttsEngine).toBe('msedge-tts');
    expect(typeof result.current.setTtsEngine).toBe('function');

    act(() => {
      result.current.setTtsEngine('kokoro-tts');
    });
    expect(result.current.ttsEngine).toBe('kokoro-tts');

    act(() => {
      result.current.setTtsEngine('machine-tts');
    });
    expect(result.current.ttsEngine).toBe('machine-tts');
  });

  it('AudioPlayer renders the 3-engine selector with all 3 selectable engines', () => {
    const handleChangeEngine = vi.fn();

    render(
      <AudioPlayer
        isPlaying={false}
        currentTimeMs={0}
        totalDurationMs={10000}
        onToggle={vi.fn()}
        ttsEngine="msedge-tts"
        onChangeTtsEngine={handleChangeEngine}
      />
    );

    const select = screen.getByRole('combobox', { name: /select tts engine/i });
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('msedge-tts');

    expect(screen.getByRole('option', { name: /microsoft tts/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /kokoro-tts/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /machine tts/i })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'kokoro-tts' } });
    expect(handleChangeEngine).toHaveBeenCalledWith('kokoro-tts');

    fireEvent.change(select, { target: { value: 'machine-tts' } });
    expect(handleChangeEngine).toHaveBeenCalledWith('machine-tts');
  });

  it('SettingsModal displays narration voices and their live status without technical jargon', () => {
    const mockModelStatus = {
      tts: {
        primary_engine: 'msedge-tts (Cloud Neural)',
        fallback_engine: 'kokoro-tts (Local ONNX)',
        machine_engine: 'machine-tts (Local OS Speech)',
        engines: ['msedge-tts', 'kokoro-tts', 'machine-tts'],
        model_exists: false,
      },
    };

    render(
      <ThemeProvider>
        <SettingsModal onClose={vi.fn()} modelStatus={mockModelStatus} />
      </ThemeProvider>
    );

    expect(screen.getByText(/1\. Studio Cast Voices/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Expressive Offline Voices/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Device Speech/i)).toBeInTheDocument();
    expect(screen.getByText(/Voice Cast & Narration/i)).toBeInTheDocument();
    expect(screen.getByText(/This voice isn't available right now\. Try another one\./i)).toBeInTheDocument();
    expect(screen.getByText(/Unavailable/i)).toBeInTheDocument();
  });

  it('useAudioSync supports paradee-tts and paradee-mixed and computes mixedCastMap for Narrator + top 3 characters and 5th+ extras', () => {
    const mockTimeline = [
      { segment_id: 1, type: 'narration', character_id: 'narrator', text: 'Once upon a time.' },
      { segment_id: 2, type: 'dialogue', character_id: 'alice', gender: 'female', text: 'Hello!' },
      { segment_id: 3, type: 'dialogue', character_id: 'alice', gender: 'female', text: 'How are you?' },
      { segment_id: 4, type: 'dialogue', character_id: 'alice', gender: 'female', text: 'Nice day.' },
      { segment_id: 5, type: 'dialogue', character_id: 'alice', gender: 'female', text: 'Indeed.' },
      { segment_id: 6, type: 'dialogue', character_id: 'bob', gender: 'male', text: 'Good morning.' },
      { segment_id: 7, type: 'dialogue', character_id: 'bob', gender: 'male', text: 'Yes it is.' },
      { segment_id: 8, type: 'dialogue', character_id: 'bob', gender: 'male', text: 'Let us go.' },
      { segment_id: 9, type: 'dialogue', character_id: 'claire', gender: 'female', text: 'Wait for me!' },
      { segment_id: 10, type: 'dialogue', character_id: 'claire', gender: 'female', text: 'I am ready.' },
      { segment_id: 11, type: 'dialogue', character_id: 'dave', gender: 'male', text: 'See you later.' },
    ];

    const { result } = renderHook(() => useAudioSync(mockTimeline));

    act(() => {
      result.current.setTtsEngine('paradee-tts');
    });
    expect(result.current.ttsEngine).toBe('paradee-tts');

    act(() => {
      result.current.setTtsEngine('paradee-mixed');
    });
    expect(result.current.ttsEngine).toBe('paradee-mixed');

    const castMap = result.current.mixedCastMap;
    expect(castMap.get('narrator')).toEqual({
      engine: 'paradee-tts',
      voiceId: 'bm_fable',
      slot: 1,
    });
    expect(castMap.get('alice')).toEqual({
      engine: 'paradee-tts',
      voiceId: 'bf_isabella',
      slot: 2,
    });
    expect(castMap.get('bob')).toEqual({
      engine: 'paradee-tts',
      voiceId: 'am_puck',
      slot: 3,
    });
    expect(castMap.get('claire')).toEqual({
      engine: 'paradee-tts',
      voiceId: 'af_heart',
      slot: 4,
    });

    const daveCast = castMap.get('dave');
    expect(daveCast.engine).toBe('machine-tts');
    expect(daveCast.voiceId).toMatch(/^mac_/);
    expect(daveCast.slot).toBe(5);
  });

  it('AudioPlayer renders Paradee-8M and Paradee + Machine (Mixed) options in the Select TTS Engine dropdown', () => {
    const handleChangeEngine = vi.fn();

    render(
      <AudioPlayer
        isPlaying={false}
        currentTimeMs={0}
        totalDurationMs={10000}
        onToggle={vi.fn()}
        ttsEngine="msedge-tts"
        onChangeTtsEngine={handleChangeEngine}
      />
    );

    const select = screen.getByRole('combobox', { name: /select tts engine/i });
    expect(screen.getByRole('option', { name: /microsoft tts/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /kokoro-tts/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /paradee-8m/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /paradee \+ machine \(mixed\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^machine tts$/i })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'paradee-tts' } });
    expect(handleChangeEngine).toHaveBeenCalledWith('paradee-tts');

    fireEvent.change(select, { target: { value: 'paradee-mixed' } });
    expect(handleChangeEngine).toHaveBeenCalledWith('paradee-mixed');
  });

  it('SettingsModal renders Paradee-8M Micro ONNX, Paradee + Machine Mixed Cast Mode, and AI Manuscript Parsers', () => {
    const mockModelStatus = {
      tts: {
        model_exists: false,
      },
      paradee: {
        model_exists: true,
      },
      parsers: {
        gemini: { configured: true },
        'unlimited-ocr': { reachable: false },
      },
    };

    render(
      <ThemeProvider>
        <SettingsModal onClose={vi.fn()} modelStatus={mockModelStatus} />
      </ThemeProvider>
    );

    expect(screen.getByText(/4\. Paradee-8M Micro ONNX/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. Paradee \+ Machine Mixed Cast Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Manuscript Parsers/i)).toBeInTheDocument();
    expect(screen.getByText(/Paradee Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Hybrid Ready/i)).toBeInTheDocument();
  });

  it('useAudioSync initializes ttsEngine from localStorage and persists changes', () => {
    localStorage.setItem('synctone_tts_engine', 'kokoro-tts');
    const { result } = renderHook(() => useAudioSync([]));
    expect(result.current.ttsEngine).toBe('kokoro-tts');

    act(() => {
      result.current.setTtsEngine('paradee-mixed');
    });
    expect(result.current.ttsEngine).toBe('paradee-mixed');
    expect(localStorage.getItem('synctone_tts_engine')).toBe('paradee-mixed');
    localStorage.removeItem('synctone_tts_engine');
  });

  it('speakActiveSegment passes full metadata to /api/voices/speak for dialogue and narration', () => {
    const originalAudio = global.Audio;
    let createdAudioInstance = null;
    global.Audio = vi.fn().mockImplementation(() => {
      createdAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        src: '',
      };
      return createdAudioInstance;
    });

    const mockTimeline = [
      {
        segment_id: 1,
        type: 'dialogue',
        character_id: 'char_ron',
        speaker_name: 'Ron Weasley',
        text: 'Bloody hell, Harry!',
        start_ms: 0,
        end_ms: 2500,
      },
      {
        segment_id: 2,
        type: 'narration',
        character_id: 'narrator',
        speaker_name: 'Narrator',
        text: 'Harry looked at the wand.',
        start_ms: 2500,
        end_ms: 5000,
      },
    ];

    const { result } = renderHook(() =>
      useAudioSync(mockTimeline, {
        novelId: 'novel_hp1',
        chapterId: 'chap_1',
      })
    );

    act(() => {
      result.current.speakSegment(1);
    });

    expect(createdAudioInstance).toBeTruthy();
    expect(createdAudioInstance.src).toContain('/api/voices/speak?');
    expect(createdAudioInstance.src).toContain('character_id=char_ron');
    expect(createdAudioInstance.src).toContain('speaker_name=Ron%20Weasley');
    expect(createdAudioInstance.src).toContain('is_narrator=false');
    expect(createdAudioInstance.src).toContain('novel_id=novel_hp1');
    expect(createdAudioInstance.src).toContain('chapter_id=chap_1');

    act(() => {
      result.current.speakSegment(2);
    });

    expect(createdAudioInstance.src).toContain('character_id=narrator');
    expect(createdAudioInstance.src).toContain('speaker_name=Narrator');
    expect(createdAudioInstance.src).toContain('is_narrator=true');
    expect(createdAudioInstance.src).toContain('novel_id=novel_hp1');
    expect(createdAudioInstance.src).toContain('chapter_id=chap_1');

    global.Audio = originalAudio;
  });

  it('paradee-mixed delegates cast slotting to the backend /api/voices/speak endpoint', () => {
    const originalAudio = global.Audio;
    let createdAudioInstance = null;
    global.Audio = vi.fn().mockImplementation(() => {
      createdAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        src: '',
      };
      return createdAudioInstance;
    });

    const mockTimeline = [
      {
        segment_id: 5,
        type: 'dialogue',
        character_id: 'dave',
        speaker_name: 'Dave',
        text: 'Extra character speaking.',
        start_ms: 0,
        end_ms: 2000,
      },
    ];

    const { result } = renderHook(() =>
      useAudioSync(mockTimeline, {
        novelId: 'novel_123',
        chapterId: 'chap_456',
      })
    );

    act(() => {
      result.current.setTtsEngine('paradee-mixed');
    });

    act(() => {
      result.current.speakSegment(5);
    });

    expect(createdAudioInstance).toBeTruthy();
    expect(createdAudioInstance.src).toContain('engine=paradee-mixed');
    expect(createdAudioInstance.src).toContain('character_id=dave');
    expect(createdAudioInstance.src).toContain('novel_id=novel_123');
    expect(createdAudioInstance.src).toContain('chapter_id=chap_456');

    global.Audio = originalAudio;
  });

  it('machine-tts tries /api/voices/speak?engine=machine-tts first before offline fallback', () => {
    const originalAudio = global.Audio;
    let createdAudioInstance = null;
    global.Audio = vi.fn().mockImplementation(() => {
      createdAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        src: '',
      };
      return createdAudioInstance;
    });

    const mockTimeline = [
      {
        segment_id: 1,
        type: 'dialogue',
        character_id: 'alice',
        text: 'Test machine speech.',
        start_ms: 0,
        end_ms: 1000,
      },
    ];

    const { result } = renderHook(() => useAudioSync(mockTimeline));

    act(() => {
      result.current.setTtsEngine('machine-tts');
    });

    act(() => {
      result.current.speakSegment(1);
    });

    expect(createdAudioInstance).toBeTruthy();
    expect(createdAudioInstance.src).toContain('engine=machine-tts');

    // Simulate server error triggering offline fallback to speechSynthesis
    const mockSpeak = vi.fn();
    window.speechSynthesis = {
      cancel: vi.fn(),
      speak: mockSpeak,
      getVoices: vi.fn().mockReturnValue([]),
    };
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };

    act(() => {
      createdAudioInstance.onerror();
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);

    global.Audio = originalAudio;
  });

  it('Voice TTS <-> Studio Track toggle maintains segment/timestamp, pauses opposing audio, and ignores event objects', () => {
    const mockTimeline = [
      { segment_id: 1, start_ms: 0, end_ms: 3000, text: 'One' },
      { segment_id: 2, start_ms: 3000, end_ms: 7000, text: 'Two' },
    ];

    const { result } = renderHook(() => useAudioSync(mockTimeline));

    const mockStudioAudio = {
      currentTime: 4.5,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    };
    result.current.audioRef.current = mockStudioAudio;

    act(() => {
      result.current.seekToTimeMs(4500);
    });

    expect(result.current.currentTimeMs).toBe(4500);
    expect(result.current.activeSegmentId).toBe(2);

    // Switch Studio -> Voice TTS
    act(() => {
      result.current.togglePlaybackMode('tts');
    });

    expect(mockStudioAudio.pause).toHaveBeenCalled();
    expect(result.current.playbackMode).toBe('tts');
    expect(result.current.currentTimeMs).toBe(4500);
    expect(result.current.activeSegmentId).toBe(2);

    // Switch Voice TTS -> Studio Track
    act(() => {
      result.current.togglePlaybackMode('studio');
    });

    expect(result.current.playbackMode).toBe('studio');
    expect(mockStudioAudio.currentTime).toBe(4.5);
    expect(result.current.currentTimeMs).toBe(4500);

    // Corrupt with synthetic event object -> safely toggles without corrupting state
    act(() => {
      result.current.togglePlaybackMode({ type: 'click', preventDefault: vi.fn() });
    });
    expect(result.current.playbackMode).toBe('tts');
  });

  it('useAudioSync alternates dialogue_turn_even / dialogue_turn_odd for unresolved dialogue and forwards gender and cast_slot', () => {
    const originalAudio = global.Audio;
    let createdAudioInstance = null;
    global.Audio = vi.fn().mockImplementation(() => {
      createdAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        src: '',
      };
      return createdAudioInstance;
    });

    try {
      const mockTimeline = [
        {
          segment_id: 1,
          type: 'dialogue',
          character_id: 'unresolved',
          text: 'Who is knocking at Baker Street?',
          start_ms: 0,
          end_ms: 2000,
        },
        {
          segment_id: 2,
          type: 'dialogue',
          character_id: '',
          text: 'A masked visitor from Bohemia.',
          start_ms: 2000,
          end_ms: 4000,
        },
        {
          segment_id: 3,
          type: 'dialogue',
          character_id: 'irene_adler',
          speaker_name: 'Irene Adler',
          gender: 'female',
          cast_slot: 2,
          text: 'Good night, Mister Sherlock Holmes.',
          start_ms: 4000,
          end_ms: 6500,
        },
      ];

      const { result } = renderHook(() =>
        useAudioSync(mockTimeline, {
          novelId: 'novel_holmes',
          chapterId: 'chap_bohemia',
        })
      );

      act(() => {
        result.current.speakSegment(1);
      });
      expect(createdAudioInstance.src).toContain('character_id=dialogue_turn_even');

      act(() => {
        result.current.speakSegment(2);
      });
      expect(createdAudioInstance.src).toContain('character_id=dialogue_turn_odd');

      act(() => {
        result.current.speakSegment(3);
      });
      expect(createdAudioInstance.src).toContain('character_id=irene_adler');
      expect(createdAudioInstance.src).toContain('gender=female');
      expect(createdAudioInstance.src).toContain('cast_slot=2');
    } finally {
      global.Audio = originalAudio;
    }
  });

  it('VoicesView togglePlaySample fetches real /api/voices/speak audio and plays via Audio', async () => {
    const originalAudio = global.Audio;
    const originalFetch = global.fetch;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    let createdAudioInstance = null;
    global.Audio = vi.fn().mockImplementation((src) => {
      createdAudioInstance = {
        src,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        onended: null,
        onerror: null,
      };
      return createdAudioInstance;
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock-voice-sample');
    URL.revokeObjectURL = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(new Blob(['RIFF'], { type: 'audio/wav' })),
    });

    const novelsSpy = vi.spyOn(api.novels, 'list').mockResolvedValue({ novels: [] });
    const modelsSpy = vi.spyOn(api.status, 'models').mockResolvedValue({ tts: { engines: ['msedge-tts'] } });

    try {
      render(
        <ThemeProvider>
          <VoicesView ttsEngine="paradee-tts" />
        </ThemeProvider>
      );

      const auditionBtn = screen.getByRole('button', {
        name: /audition sample for ryan \(british narrator\)/i,
      });
      fireEvent.click(auditionBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      const fetchedUrl = global.fetch.mock.calls[0][0];
      expect(fetchedUrl).toContain('/api/voices/speak?');
      expect(fetchedUrl).toContain('voice_id=en-GB-RyanNeural');
      expect(fetchedUrl).toContain('engine=paradee-tts');

      await waitFor(() => {
        expect(createdAudioInstance).toBeTruthy();
        expect(createdAudioInstance.play).toHaveBeenCalledTimes(1);
      });
      expect(createdAudioInstance.src).toBe('blob:mock-voice-sample');
    } finally {
      global.Audio = originalAudio;
      global.fetch = originalFetch;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      novelsSpy.mockRestore();
      modelsSpy.mockRestore();
    }
  });

  it('SettingsModal renders interactive Heuristic/Gemini/Ollama/Vision OCR parser subpanels and triggers Re-Parse Current Chapter', async () => {
    try {
      localStorage.removeItem('synctone_parser_config');
      localStorage.removeItem('synctone_parser_engine');
    } catch (_) {}

    const getParserConfigSpy = vi.spyOn(api.status, 'getParserConfig').mockResolvedValue({
      heuristic: { sensitivity: 'balanced', turnTaking: true, quoteStyle: 'auto' },
      gemini: { hasKey: false, model: 'gemini-2.5-flash', temperature: 0.1 },
      ollama: { url: 'http://localhost:11434', model: 'llama3:8b' },
      ocr: { baseUrl: 'http://localhost:8000/v1', model: 'baidu/Unlimited-OCR' },
      ollamaModels: ['llama3:8b', 'mistral'],
    });
    const updateParserConfigSpy = vi.spyOn(api.status, 'updateParserConfig').mockResolvedValue({ ok: true });
    const testParserConnectionSpy = vi.spyOn(api.status, 'testParserConnection').mockResolvedValue({
      ok: true,
      message: 'Connected & verified.',
    });
    const modelsSpy = vi.spyOn(api.status, 'models').mockResolvedValue({
      tts: { engines: ['msedge-tts', 'kokoro-tts', 'paradee-tts', 'paradee-mixed', 'machine-tts'], model_exists: true },
      parsers: {
        gemini: { configured: false },
        ollama: { available: true },
        'unlimited-ocr': { reachable: true },
      },
    });
    const onReparseChapter = vi.fn().mockResolvedValue({
      segments: Array.from({ length: 12 }, (_, idx) => ({ segment_id: idx + 1 })),
    });

    try {
      render(
        <ThemeProvider>
          <SettingsModal
            onClose={vi.fn()}
            currentChapterId="chap_bohemia"
            onReparseChapter={onReparseChapter}
          />
        </ThemeProvider>
      );

      // Default Heuristic subpanel controls
      expect(screen.getByText(/Heuristic Attribution Settings/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Attribution Mode')).toBeInTheDocument();
      expect(screen.getByLabelText('Quote Detection')).toBeInTheDocument();
      expect(screen.getByLabelText('Conversational Turn-Taking')).toBeChecked();

      // Switch to Gemini AI subpanel & Save/Test
      fireEvent.click(screen.getByRole('button', { name: /Gemini AI/i }));
      const geminiKeyInput = screen.getByLabelText('Gemini API Key');
      expect(geminiKeyInput).toBeInTheDocument();
      expect(screen.getByLabelText('Gemini Model')).toBeInTheDocument();
      expect(screen.getByLabelText('Gemini Temperature')).toBeInTheDocument();
      fireEvent.change(geminiKeyInput, { target: { value: 'AIzaTestMockKey' } });
      fireEvent.click(screen.getByRole('button', { name: /Save & Test Gemini/i }));
      await waitFor(() => {
        expect(testParserConnectionSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            engine: 'gemini',
            config: expect.objectContaining({ apiKey: 'AIzaTestMockKey' }),
          })
        );
      });
      expect(updateParserConfigSpy).toHaveBeenCalled();

      // Switch to Ollama subpanel & Probe
      fireEvent.click(screen.getByRole('button', { name: /^Ollama/i }));
      expect(screen.getByLabelText('Ollama Endpoint URL')).toBeInTheDocument();
      expect(screen.getByLabelText('Ollama Model')).toBeInTheDocument();
      expect(screen.getByLabelText('Ollama Model ID')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Save & Probe Ollama/i }));
      await waitFor(() => {
        expect(testParserConnectionSpy).toHaveBeenCalledWith(
          expect.objectContaining({ engine: 'ollama' })
        );
      });

      // Switch to Vision OCR subpanel & Probe
      fireEvent.click(screen.getByRole('button', { name: /Vision OCR/i }));
      expect(screen.getByText(/Self-hosted OpenAI\/vLLM Vision OCR for scanned PDFs/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Vision OCR Endpoint URL')).toBeInTheDocument();
      expect(screen.getByLabelText('Vision OCR Model ID')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Save & Probe OCR/i }));
      await waitFor(() => {
        expect(testParserConnectionSpy).toHaveBeenCalledWith(
          expect.objectContaining({ engine: 'unlimited-ocr' })
        );
      });

      // Trigger Re-Parse Current Chapter with selected parser
      const reparseBtn = screen.getByRole('button', { name: /Re-Parse Current Chapter/i });
      fireEvent.click(reparseBtn);
      await waitFor(() => {
        expect(onReparseChapter).toHaveBeenCalledWith(
          'unlimited-ocr',
          expect.objectContaining({ ocr: expect.any(Object) })
        );
      });
      await waitFor(() => {
        expect(screen.getByText(/Re-parsed chapter with unlimited-ocr \(12 segments updated\)\./i)).toBeInTheDocument();
      });
    } finally {
      getParserConfigSpy.mockRestore();
      updateParserConfigSpy.mockRestore();
      testParserConnectionSpy.mockRestore();
      modelsSpy.mockRestore();
    }
  });
});
