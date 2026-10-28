/**
 * SyncTone — Speaker Color Palette & Utility
 *
 * Provides high-contrast, accessible color tokens for multi-voice dialogue
 * highlighting and narrator passages in the synchronized reader.
 */

export const SPEAKER_PALETTE = [
  {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
    ring: 'ring-amber-400',
  },
  {
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    text: 'text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    ring: 'ring-emerald-400',
  },
  {
    bg: 'bg-purple-50',
    border: 'border-purple-400',
    text: 'text-purple-800',
    badge: 'bg-purple-100 text-purple-900 border-purple-200',
    ring: 'ring-purple-400',
  },
  {
    bg: 'bg-sky-50',
    border: 'border-sky-400',
    text: 'text-sky-800',
    badge: 'bg-sky-100 text-sky-900 border-sky-200',
    ring: 'ring-sky-400',
  },
  {
    bg: 'bg-rose-50',
    border: 'border-rose-400',
    text: 'text-rose-800',
    badge: 'bg-rose-100 text-rose-900 border-rose-200',
    ring: 'ring-rose-400',
  },
  {
    bg: 'bg-indigo-50',
    border: 'border-indigo-400',
    text: 'text-indigo-800',
    badge: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    ring: 'ring-indigo-400',
  },
  {
    bg: 'bg-teal-50',
    border: 'border-teal-400',
    text: 'text-teal-800',
    badge: 'bg-teal-100 text-teal-900 border-teal-200',
    ring: 'ring-teal-400',
  },
  {
    bg: 'bg-orange-50',
    border: 'border-orange-400',
    text: 'text-orange-800',
    badge: 'bg-orange-100 text-orange-900 border-orange-200',
    ring: 'ring-orange-400',
  },
];

export const NARRATOR_COLOR = {
  bg: 'bg-slate-50/70',
  border: 'border-slate-300',
  text: 'text-slate-700',
  badge: 'bg-slate-100 text-slate-600 border-slate-200',
  ring: 'ring-slate-400',
};

export function getSpeakerColor(speakerId) {
  if (!speakerId || speakerId === 'narrator') {
    return NARRATOR_COLOR;
  }
  let hash = 0;
  const str = String(speakerId).toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return SPEAKER_PALETTE[Math.abs(hash) % SPEAKER_PALETTE.length];
}
