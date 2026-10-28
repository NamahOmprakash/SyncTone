import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useSynthesisProgress } from '../hooks/useSynthesisProgress';
import SynthesisProgressBar from '../components/SynthesisProgressBar';

// Mock WebSocket class
class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data) {}
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }

  // Test helper to simulate server message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

describe('Milestone 6 — Live Synthesis Progress', () => {
  let originalWebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  describe('useSynthesisProgress Hook', () => {
    it('connects to chapter websocket and tracks parsing, segment progress, and completion', async () => {
      const { result } = renderHook(() => useSynthesisProgress('ch-400'));

      // Wait for onopen
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      expect(MockWebSocket.instances.length).toBe(1);
      expect(MockWebSocket.instances[0].url).toContain('/api/ws/progress/ch-400');
      expect(result.current.isConnected).toBe(true);

      // Simulate parsing event
      act(() => {
        MockWebSocket.instances[0].simulateMessage({
          status: 'parsing',
          percent_complete: 15,
        });
      });

      expect(result.current.status).toBe('parsing');
      expect(result.current.percentComplete).toBe(15);

      // Simulate segment synthesis event
      act(() => {
        MockWebSocket.instances[0].simulateMessage({
          status: 'synthesizing',
          current_segment: 3,
          total_segments: 10,
          percent_complete: 30,
        });
      });

      expect(result.current.status).toBe('synthesizing');
      expect(result.current.currentSegment).toBe(3);
      expect(result.current.totalSegments).toBe(10);
      expect(result.current.percentComplete).toBe(30);

      // Simulate completion event
      act(() => {
        MockWebSocket.instances[0].simulateMessage({
          status: 'complete',
          percent_complete: 100,
        });
      });

      expect(result.current.isComplete).toBe(true);
      expect(result.current.percentComplete).toBe(100);
    });

    it('cleans up and closes websocket connection on unmount', async () => {
      const { unmount } = renderHook(() => useSynthesisProgress('ch-500'));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      const wsInstance = MockWebSocket.instances[0];
      const closeSpy = vi.spyOn(wsInstance, 'close');

      unmount();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('SynthesisProgressBar Component', () => {
    it('renders progress percentage, segment counts, and active status', () => {
      render(
        <SynthesisProgressBar
          status="synthesizing"
          percentComplete={45}
          currentSegment={5}
          totalSegments={12}
          message="Synthesizing audio segment 5 of 12"
          isConnected={true}
        />
      );

      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('synthesizing')).toBeInTheDocument();
      expect(screen.getByText(/Synthesizing audio segment 5 of 12/i)).toBeInTheDocument();
      expect(screen.getByText(/7 remaining/i)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
    });

    it('displays completion state and calls onDismiss when dismissed', () => {
      const handleDismiss = vi.fn();

      render(
        <SynthesisProgressBar
          status="complete"
          percentComplete={100}
          message="Audio synthesis completed successfully!"
          onDismiss={handleDismiss}
        />
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('complete')).toBeInTheDocument();
      expect(screen.getByText(/Audio synthesis completed successfully!/i)).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dismiss progress'));
      expect(handleDismiss).toHaveBeenCalled();
    });
  });
});
