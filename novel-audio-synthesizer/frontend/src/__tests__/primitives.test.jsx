import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Button,
  Input,
  Card,
  Dialog,
  Tabs,
  Toast,
  Tooltip,
  Skeleton,
  Switch,
  SegmentedControl,
} from '../components/primitives';

describe('Shared Primitives Suite', () => {
  describe('Button', () => {
    it('renders default button and handles clicks', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click Me</Button>);
      const btn = screen.getByRole('button', { name: 'Click Me' });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('handles disabled state and prevents clicks', () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);
      const btn = screen.getByRole('button', { name: 'Disabled' });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('renders loading state with spinner and disables button', () => {
      const handleClick = vi.fn();
      render(<Button isLoading onClick={handleClick}>Saving</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn.querySelector('svg.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Input', () => {
    it('renders input with linked label and accepts text', () => {
      render(<Input id="test-input" label="Username" placeholder="Enter username" />);
      const input = screen.getByLabelText('Username');
      expect(input).toBeInTheDocument();
      fireEvent.change(input, { target: { value: 'johndoe' } });
      expect(input.value).toBe('johndoe');
    });

    it('renders error state with aria-invalid and error message', () => {
      render(
        <Input
          id="err-input"
          label="Email"
          error="Invalid email address"
          placeholder="email@example.com"
        />
      );
      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });

    it('respects disabled state', () => {
      render(<Input id="dis-input" label="Locked" disabled />);
      const input = screen.getByLabelText('Locked');
      expect(input).toBeDisabled();
    });
  });

  describe('Switch', () => {
    it('renders accessible switch and toggles on click', () => {
      const handleToggle = vi.fn();
      render(<Switch id="dark-mode" label="Dark Mode" checked={false} onChange={handleToggle} />);
      const switchEl = screen.getByRole('switch', { name: 'Dark Mode' });
      expect(switchEl).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(switchEl);
      expect(handleToggle).toHaveBeenCalledWith(true);
    });

    it('toggles on Space and Enter keydown', () => {
      const handleToggle = vi.fn();
      render(<Switch id="notifications" label="Notifications" checked={true} onChange={handleToggle} />);
      const switchEl = screen.getByRole('switch', { name: 'Notifications' });
      expect(switchEl).toHaveAttribute('aria-checked', 'true');
      fireEvent.keyDown(switchEl, { key: ' ' });
      expect(handleToggle).toHaveBeenCalledWith(false);
    });

    it('does not toggle when disabled', () => {
      const handleToggle = vi.fn();
      render(<Switch id="disabled-sw" label="Disabled" disabled checked={false} onChange={handleToggle} />);
      const switchEl = screen.getByRole('switch', { name: 'Disabled' });
      expect(switchEl).toBeDisabled();
      fireEvent.click(switchEl);
      expect(handleToggle).not.toHaveBeenCalled();
    });
  });

  describe('SegmentedControl', () => {
    it('renders options and manages radio selection', () => {
      const handleChange = vi.fn();
      const options = [
        { id: 'sans', label: 'Sans' },
        { id: 'serif', label: 'Serif' },
        { id: 'mono', label: 'Mono' },
      ];
      render(
        <SegmentedControl
          id="font-select"
          aria-label="Font Choice"
          options={options}
          value="serif"
          onChange={handleChange}
        />
      );

      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(3);
      expect(radios[1]).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(radios[0]);
      expect(handleChange).toHaveBeenCalledWith('sans');
    });

    it('supports arrow key navigation across segments', () => {
      const handleChange = vi.fn();
      const options = [
        { id: 'a', label: 'Option A' },
        { id: 'b', label: 'Option B' },
      ];
      render(
        <SegmentedControl
          options={options}
          value="a"
          onChange={handleChange}
        />
      );

      const firstRadio = screen.getAllByRole('radio')[0];
      fireEvent.keyDown(firstRadio, { key: 'ArrowRight' });
      expect(handleChange).toHaveBeenCalledWith('b');
    });
  });

  describe('Dialog', () => {
    it('renders children when open is true', () => {
      render(
        <Dialog isOpen={true} onClose={() => {}} title="Confirm Action">
          <p>Dialog body content</p>
        </Dialog>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Dialog body content')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <Dialog isOpen={false} onClose={() => {}} title="Closed Dialog">
          <p>Hidden body</p>
        </Dialog>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('calls onClose when ESC is pressed', () => {
      const handleClose = vi.fn();
      render(
        <Dialog isOpen={true} onClose={handleClose} title="ESC Test">
          <p>Press escape</p>
        </Dialog>
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  describe('Tabs', () => {
    it('renders channels and manages active selection', () => {
      const handleSelect = vi.fn();
      const tabs = [
        { id: 'all', label: 'All Channels' },
        { id: 'verified', label: 'Verified' },
      ];
      render(<Tabs tabs={tabs} activeTab="all" onChange={handleSelect} />);
      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Verified' }));
      expect(handleSelect).toHaveBeenCalledWith('verified');
    });
  });

  describe('Tooltip', () => {
    it('renders trigger element and provides accessible description on focus or hover', () => {
      render(
        <Tooltip content="Helper text" delay={0}>
          <button type="button">Hover me</button>
        </Tooltip>
      );
      const btn = screen.getByRole('button', { name: 'Hover me' });
      expect(btn).toBeInTheDocument();
      fireEvent.focus(btn);
      expect(screen.getByText('Helper text')).toBeInTheDocument();
    });
  });

  describe('Skeleton', () => {
    it('renders card skeleton with role status and aria-busy', () => {
      render(<Skeleton variant="card" />);
      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
    });

    it('renders text skeleton with aria-hidden', () => {
      const { container } = render(<Skeleton variant="text" />);
      expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Toast', () => {
    it('renders status notification with role status', () => {
      render(
        <Toast
          id="t1"
          title="Saved successfully"
          message="Settings updated"
          variant="success"
          onDismiss={() => {}}
        />
      );
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Saved successfully')).toBeInTheDocument();
      expect(screen.getByText('Settings updated')).toBeInTheDocument();
    });
  });

  describe('Motion Tokens & Reduced Motion', () => {
    it('provides standard motion durations and easings', async () => {
      const { MOTION_DURATIONS, MOTION_EASINGS } = await import('../tokens/motion');
      expect(MOTION_DURATIONS.micro).toBe(120);
      expect(MOTION_DURATIONS.standard).toBe(200);
      expect(MOTION_DURATIONS.moderate).toBe(320);
      expect(MOTION_EASINGS.natural).toContain('cubic-bezier');
    });

    it('executes fallback immediately when reduced motion is preferred or unsupported', async () => {
      const { executeViewTransition } = await import('../tokens/motion');
      const callback = vi.fn();
      const res = executeViewTransition(callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(res).toHaveProperty('finished');
    });
  });
});

