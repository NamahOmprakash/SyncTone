/**
 * CONTRACT 4 — FROZEN SPECIFICATION
 * Reading Anchor & Position Helpers
 *
 * Persisted progress stores the segment anchor (segmentId / segment_order / position_ms),
 * NEVER a page index.
 * After ANY re-pagination, the active page is derived deterministically from the anchorSegmentId.
 */

export function derivePageIndexFromAnchor(pages = [], anchorSegmentId = null) {
  if (!pages || pages.length === 0 || anchorSegmentId == null) return 0;

  const foundIndex = pages.findIndex((page) => {
    if (!page) return false;
    // Contract 3 format ({ parts: [{ segmentId, ... }] })
    if (Array.isArray(page.parts)) {
      return page.parts.some((p) => p.segmentId === anchorSegmentId || p.segmentId === Number(anchorSegmentId));
    }
    // Phase 0.5 format (array of segment objects: [seg1, seg2])
    if (Array.isArray(page)) {
      return page.some((s) => {
        const id = s.segment_id !== undefined ? s.segment_id : (s.id !== undefined ? s.id : s.order);
        return id === anchorSegmentId || id === Number(anchorSegmentId);
      });
    }
    return false;
  });

  return foundIndex >= 0 ? foundIndex : 0;
}

export function getAnchorSegmentIdFromPage(pages = [], pageIndex = 0) {
  if (!pages || pages.length === 0 || pageIndex < 0 || pageIndex >= pages.length) return null;
  const page = pages[pageIndex];
  if (!page) return null;

  if (Array.isArray(page.parts) && page.parts.length > 0) {
    return page.parts[0].segmentId;
  }
  if (Array.isArray(page) && page.length > 0) {
    const s = page[0];
    return s.segment_id !== undefined ? s.segment_id : (s.id !== undefined ? s.id : s.order);
  }
  return null;
}

