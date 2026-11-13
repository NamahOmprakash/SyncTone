import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { IconShield, IconSoundwave, IconUsers, IconBook } from './icons';

export default function AdminView({ onNavigateHome, onOpenSettings }) {
  const { role, isWriterOrAdmin } = useAuth();

  if (role !== 'admin') {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-elevated)] border theme-border flex items-center justify-center text-[var(--accent-text)]">
          <IconShield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold theme-heading font-serif mb-2">Restricted Access</h2>
        <p className="text-sm theme-muted mb-6">
          This area is available only to system administrators. If you believe this is an error, please sign in with an administrator account.
        </p>
        <button
          onClick={onNavigateHome}
          className="px-6 py-2.5 rounded-full bg-[var(--cta-primary-bg)] text-[var(--cta-primary-text)] text-xs font-bold hover:bg-[var(--cta-primary-hover)] transition-all duration-200 shadow-md hover:scale-[1.03] active:scale-[0.96] cursor-pointer"
        >
          Return to Library
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 pb-4 border-b theme-border">
        <div>
          <h1 className="text-2xl font-bold theme-heading font-serif">Studio Administration</h1>
          <p className="text-xs theme-muted mt-1">
            System overview, voice synthesis status, and library management.
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="px-5 py-2 rounded-full bg-[var(--cta-primary-bg)] text-[var(--cta-primary-text)] text-xs font-bold hover:bg-[var(--cta-primary-hover)] transition-all duration-200 shadow-md hover:scale-[1.03] active:scale-[0.96] cursor-pointer"
        >
          Voice Settings
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="p-5 rounded-2xl theme-surface border theme-border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent)]/15 text-[var(--accent-text)]">
              <IconSoundwave className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs theme-muted">Voice Synthesis</p>
              <p className="text-base font-bold theme-heading text-status-success">Ready</p>
            </div>
          </div>
          <p className="text-xs theme-muted">Edge Neural and Kokoro voices are active.</p>
        </div>

        <div className="p-5 rounded-2xl theme-surface border theme-border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-[var(--info)]/15 text-[var(--info)]">
              <IconBook className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs theme-muted">Library Publications</p>
              <p className="text-base font-bold theme-heading">All Channels</p>
            </div>
          </div>
          <p className="text-xs theme-muted">Verified classics and community manuscripts.</p>
        </div>

        <div className="p-5 rounded-2xl theme-surface border theme-border shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-[var(--success)]/15 text-[var(--success)]">
              <IconUsers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs theme-muted">Access Control</p>
              <p className="text-base font-bold theme-heading">Enforced</p>
            </div>
          </div>
          <p className="text-xs theme-muted">Role-based permissions with secure session cookies.</p>
        </div>
      </div>
    </div>
  );
}

