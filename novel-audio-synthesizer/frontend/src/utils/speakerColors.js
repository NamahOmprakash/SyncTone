/**
 * SyncTone — Earthy Luxury Speaker Color Palette & Utility
 *
 * Provides high-contrast, accessible color tokens for multi-voice dialogue
 * highlighting and narrator passages in the synchronized reader.
 */

export const SPEAKER_PALETTE = [
  // 1. Amber Glow (#D5851F)
  {
    hex: '#D5851F',
    bg: 'bg-[#D5851F]/10',
    border: 'border-[#D5851F]',
    text: 'text-[#D5851F]',
    badge: 'bg-[#D5851F]/15 text-[#D5851F] border-[#D5851F]/30',
    ring: 'ring-[#D5851F]',
  },
  // 2. Sage Green (#87A96B)
  {
    hex: '#87A96B',
    bg: 'bg-[#87A96B]/10',
    border: 'border-[#87A96B]',
    text: 'text-[#87A96B]',
    badge: 'bg-[#87A96B]/15 text-[#87A96B] border-[#87A96B]/30',
    ring: 'ring-[#87A96B]',
  },
  // 3. Walnut Brown (#5A3E2B)
  {
    hex: '#5A3E2B',
    bg: 'bg-[#5A3E2B]/10',
    border: 'border-[#5A3E2B]',
    text: 'text-[#5A3E2B]',
    badge: 'bg-[#5A3E2B]/15 text-[#5A3E2B] border-[#5A3E2B]/30',
    ring: 'ring-[#5A3E2B]',
  },
  // 4. Warm Bronze (#A88462)
  {
    hex: '#A88462',
    bg: 'bg-[#A88462]/10',
    border: 'border-[#A88462]',
    text: 'text-[#A88462]',
    badge: 'bg-[#A88462]/15 text-[#A88462] border-[#A88462]/30',
    ring: 'ring-[#A88462]',
  },
  // 5. Forest Olive
  {
    hex: '#5FA052',
    bg: 'bg-[#5FA052]/10',
    border: 'border-[#5FA052]',
    text: 'text-[#5FA052]',
    badge: 'bg-[#5FA052]/15 text-[#5FA052] border-[#5FA052]/30',
    ring: 'ring-[#5FA052]',
  },
  // 6. Warm Ochre
  {
    hex: '#C68A3C',
    bg: 'bg-[#C68A3C]/10',
    border: 'border-[#C68A3C]',
    text: 'text-[#C68A3C]',
    badge: 'bg-[#C68A3C]/15 text-[#C68A3C] border-[#C68A3C]/30',
    ring: 'ring-[#C68A3C]',
  },
  // 7. Soft Sand
  {
    hex: '#D5C4AE',
    bg: 'bg-[#D5C4AE]/15',
    border: 'border-[#D5C4AE]',
    text: 'text-[#D5C4AE]',
    badge: 'bg-[#D5C4AE]/20 text-[#D5C4AE] border-[#D5C4AE]/35',
    ring: 'ring-[#D5C4AE]',
  },
  // 8. Deep Espresso
  {
    hex: '#1A120E',
    bg: 'bg-[#1A120E]/20',
    border: 'border-[#1A120E]',
    text: 'text-[#D5C4AE]',
    badge: 'bg-[#1A120E]/30 text-[#D5C4AE] border-[#40362E]',
    ring: 'ring-[#1A120E]',
  },
  // 9. Deep Walnut
  {
    hex: '#5A3E2B',
    bg: 'bg-[#5A3E2B]/10',
    border: 'border-[#5A3E2B]',
    text: 'text-[#5A3E2B]',
    badge: 'bg-[#5A3E2B]/15 text-[#5A3E2B] border-[#5A3E2B]/30',
    ring: 'ring-[#5A3E2B]',
  },
  // 10. Terracotta
  {
    hex: '#BA4E3D',
    bg: 'bg-[#BA4E3D]/10',
    border: 'border-[#BA4E3D]',
    text: 'text-[#BA4E3D]',
    badge: 'bg-[#BA4E3D]/15 text-[#BA4E3D] border-[#BA4E3D]/30',
    ring: 'ring-[#BA4E3D]',
  },
  // 11. Charcoal
  {
    hex: '#4A4A46',
    bg: 'bg-[#4A4A46]/15',
    border: 'border-[#4A4A46]',
    text: 'text-[#D5C4AE]',
    badge: 'bg-[#4A4A46]/20 text-[#D5C4AE] border-[#4A4A46]/40',
    ring: 'ring-[#4A4A46]',
  },
];

export const AMBER_COLOR = SPEAKER_PALETTE[0];
export const SAGE_COLOR = SPEAKER_PALETTE[1];
export const WALNUT_DEEP_COLOR = SPEAKER_PALETTE[2];

export const NARRATOR_COLOR = {
  hex: '#D5C4AE',
  bg: 'bg-[#D5C4AE]/10',
  border: 'border-[#40362E]',
  text: 'text-[#D5C4AE]',
  badge: 'bg-[#3A2418] text-[#D5C4AE] border-[#40362E]',
  ring: 'ring-[#A88462]',
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
