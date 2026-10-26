import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useAudioSync } from '../hooks/useAudioSync';
import AudioPlayer from '../components/AudioPlayer';
import SettingsModal from '../components/SettingsModal';
import { ThemeProvider } from '../context/ThemeContext';

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

  it('SettingsModal displays all 3 TTS engines and their live status', () => {
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

    expect(screen.getByText(/1\. Microsoft Edge Neural TTS/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Kokoro-TTS ONNX Fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Machine Local Speech Synthesis/i)).toBeInTheDocument();
    expect(screen.getByText(/TTS Synthesis Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/Online/i)).toBeInTheDocument();
    expect(screen.getByText(/Acoustic Ready/i)).toBeInTheDocument();
  });
});
