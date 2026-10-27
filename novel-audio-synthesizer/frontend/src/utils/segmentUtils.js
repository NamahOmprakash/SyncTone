/**
 * Utility to extract inline EPUB illustration image URLs and clean text from segments.
 * Segments may contain `seg.image_url` or `[IMAGE:/static/covers/...]` in `seg.text`.
 */
export function parseSegmentImage(seg) {
  if (!seg) return { imgUrl: null, cleanText: '' };
  let imgUrl = seg.image_url || null;
  let cleanText = seg.text || '';

  if (typeof cleanText === 'string') {
    const match = cleanText.match(/\[IMAGE:(.*?)\]/);
    if (match) {
      if (!imgUrl) {
        imgUrl = match[1].trim();
      }
      cleanText = cleanText.replace(/\[IMAGE:.*?\]/g, '').trim();
    }
  }

  return { imgUrl, cleanText };
}
