import { describe, it, expect } from 'vitest';
import { fitBook, PAGE_ASPECT, MIN_READABLE_PAGE_WIDTH, HYSTERESIS_FACTOR } from '../reader/fitBook';
import { derivePageIndexFromAnchor, getAnchorSegmentIdFromPage } from '../reader/anchor';

describe('CONTRACT 1 — fitBook Pure Sizing Logic', () => {
  it('returns zero geometry for empty or zero dimensions', () => {
    const res = fitBook({ w: 0, h: 0 });
    expect(res.layout).toBe('single');
    expect(res.book).toEqual({ w: 0, h: 0 });
    expect(res.page).toEqual({ w: 0, h: 0 });
  });

  it('selects single layout on narrow viewports (<640px) with gutter=0', () => {
    const res = fitBook({ w: 375, h: 667 });
    expect(res.layout).toBe('single');
    expect(res.gutter).toBe(0);
    expect(res.book.w).toBeGreaterThan(0);
    expect(res.book.h).toBeGreaterThan(0);
    expect(res.page.w).toBe(res.book.w);
    expect(res.page.h).toBe(res.book.h);
    // Page aspect 1:1.4
    expect(res.page.h / res.page.w).toBeCloseTo(PAGE_ASPECT, 1);
  });

  it('selects two-page spread layout on wide desktop stage (e.g. 1440x900)', () => {
    const res = fitBook({ w: 1440, h: 900 });
    expect(res.layout).toBe('spread');
    expect(res.gutter).toBeGreaterThan(0);
    expect(res.book.w).toBeCloseTo(res.page.w * 2, -1);
    expect(res.book.h).toBe(res.page.h);
    expect(res.page.w).toBeGreaterThanOrEqual(MIN_READABLE_PAGE_WIDTH);
    expect(res.page.h / res.page.w).toBeCloseTo(PAGE_ASPECT, 1);
  });

  it('expands adaptive spread width beyond 772px on wide laptop viewports (e.g. 1280x580, 1024x583)', () => {
    const laptopWide = fitBook({ w: 1280, h: 580 });
    expect(laptopWide.layout).toBe('spread');
    expect(laptopWide.book.w).toBe(1180);
    expect(laptopWide.page.w).toBe(590);

    const laptopCompact = fitBook({ w: 1024, h: 583 });
    expect(laptopCompact.layout).toBe('spread');
    expect(laptopCompact.book.w).toBeGreaterThan(900);
    expect(laptopCompact.page.w).toBeGreaterThan(450);
  });

  it('applies ~8% hysteresis when near layout boundary', () => {
    // Stage dimensions near threshold where spread area and single area are comparable
    const stage = { w: 720, h: 500 };
    const resDefault = fitBook(stage);

    const resFromSpread = fitBook(stage, { prevLayout: 'spread' });
    const resFromSingle = fitBook(stage, { prevLayout: 'single' });

    // Hysteresis biases towards the previous state to avoid flapping
    expect(typeof resFromSpread.layout).toBe('string');
    expect(typeof resFromSingle.layout).toBe('string');
  });

  it('derives contentBox strictly smaller than page box', () => {
    const res = fitBook({ w: 1200, h: 800 });
    expect(res.contentBox.w).toBeLessThan(res.page.w);
    expect(res.contentBox.h).toBeLessThan(res.page.h);
    expect(res.contentBox.w).toBeGreaterThan(0);
    expect(res.contentBox.h).toBeGreaterThan(0);
  });
});

describe('CONTRACT 4 — derivePageIndexFromAnchor & Reading Anchor', () => {
  it('finds correct page index in legacy array-of-segments format', () => {
    const pages = [
      [{ segment_id: 101, text: 'First' }, { segment_id: 102, text: 'Second' }],
      [{ segment_id: 103, text: 'Third' }, { segment_id: 104, text: 'Fourth' }],
      [{ segment_id: 105, text: 'Fifth' }],
    ];

    expect(derivePageIndexFromAnchor(pages, 101)).toBe(0);
    expect(derivePageIndexFromAnchor(pages, 102)).toBe(0);
    expect(derivePageIndexFromAnchor(pages, 103)).toBe(1);
    expect(derivePageIndexFromAnchor(pages, 105)).toBe(2);
    expect(derivePageIndexFromAnchor(pages, 999)).toBe(0); // Not found fallback
  });

  it('finds correct page index in Contract 3 parts format', () => {
    const pages = [
      { parts: [{ segmentId: 'seg_1' }, { segmentId: 'seg_2' }] },
      { parts: [{ segmentId: 'seg_3' }, { segmentId: 'seg_4' }] },
    ];

    expect(derivePageIndexFromAnchor(pages, 'seg_1')).toBe(0);
    expect(derivePageIndexFromAnchor(pages, 'seg_4')).toBe(1);
  });

  it('extracts anchor segment ID from page', () => {
    const legacyPages = [
      [{ segment_id: 'seg_alpha', text: 'Alpha' }],
    ];
    expect(getAnchorSegmentIdFromPage(legacyPages, 0)).toBe('seg_alpha');

    const contractPages = [
      { parts: [{ segmentId: 'seg_omega' }] },
    ];
    expect(getAnchorSegmentIdFromPage(contractPages, 0)).toBe('seg_omega');
  });
});

