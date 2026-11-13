import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OpenGLPageReader from '../components/OpenGLPageReader';
import ReaderView from '../components/ReaderView';
import {
  computeShadowBleedBounds,
  estimateSegmentHeight,
  measureAndPaginateSegments,
  createBookSpreads,
  process4PassSegment,
} from '../utils/readerLayoutEngine';
import {
  renderPageToCanvas,
  createReverseSideTexture,
} from '../utils/pageSnapshotBridge';

describe('Moon+ Reader Pro v10.8 Architecture & Dual-View Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockNovelWithCover = {
    id: 'n-hp1',
    title: "Harry Potter and the Philosopher's Stone",
    author_username: 'jk_rowling',
    cover_object: '/covers/hp1_cover.jpg',
  };

  const mockNovelNoCover = {
    id: 'n-plain',
    title: 'Plain Text Novella',
    author_username: 'anon_author',
    cover_object: null,
  };

  const sampleSegments = [
    { order: 1, segment_id: 1, type: 'narration', text: 'Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal.', speaker_name: 'Narrator' },
    { order: 2, segment_id: 2, type: 'dialogue', text: 'Little tyke, chortled Mr. Dursley as he left the house.', speaker_name: 'Mr. Dursley' },
    { order: 3, segment_id: 3, type: 'narration', text: 'He got into his car and backed out of number four’s drive.', speaker_name: 'Narrator' },
    { order: 4, segment_id: 4, type: 'narration', text: 'It was on the corner of the street that he noticed the first sign of something peculiar.', speaker_name: 'Narrator' },
    { order: 5, segment_id: 5, type: 'dialogue', text: 'Cats do not read maps! thought Mr. Dursley.', speaker_name: 'Mr. Dursley' },
    { order: 6, segment_id: 6, type: 'narration', text: 'Mr. Dursley blinked and stared at the cat.', speaker_name: 'Narrator' },
  ];

  describe('1. readerLayoutEngine Unit Tests', () => {
    it('computeShadowBleedBounds expands boundaries according to shadowRadius and offsets', () => {
      const bounds = computeShadowBleedBounds(400, 600, 0, 0, 10, 4, 6);
      expect(bounds.left).toBeLessThanOrEqual(0);
      expect(bounds.right).toBeGreaterThanOrEqual(400);
      expect(bounds.top).toBeLessThanOrEqual(0);
      expect(bounds.bottom).toBeGreaterThanOrEqual(600);
      expect(bounds.width).toBeGreaterThan(400);
      expect(bounds.height).toBeGreaterThan(600);
    });

    it('estimateSegmentHeight calculates vertical height budget for text and badges', () => {
      const textSeg = { order: 1, type: 'narration', text: 'A short sentence.', speaker_name: 'Narrator' };
      const hText = estimateSegmentHeight(textSeg, { fontSize: 18, containerWidth: 400 });
      expect(hText).toBeGreaterThan(30);

      const imgSeg = { order: 2, type: 'narration', text: '[IMAGE:http://example.com/pic.jpg]' };
      const hImg = estimateSegmentHeight(imgSeg, { fontSize: 18, containerWidth: 400 });
      expect(hImg).toBeGreaterThan(hText);
    });

    it('measureAndPaginateSegments paginates segments into balanced pages', () => {
      const pages = measureAndPaginateSegments(sampleSegments, {
        containerWidth: 440,
        containerHeight: 640,
        fontSize: 18,
      });

      expect(pages.length).toBeGreaterThanOrEqual(2);
      const allPaginatedSegments = pages.flat();
      expect(allPaginatedSegments.length).toBe(sampleSegments.length);
    });

    it('measureAndPaginateSegments reserves firstPageExtraReservePx on Page 1 (150 vs 240)', () => {
      const denseSegments = Array.from({ length: 8 }, (_, idx) => ({
        order: idx + 1,
        segment_id: idx + 1,
        type: 'narration',
        text: 'Mr. Sherlock Holmes examined the curious telegram on his breakfast table carefully.',
        speaker_name: 'Narrator',
      }));

      const pagesDefault = measureAndPaginateSegments(denseSegments, {
        containerWidth: 460,
        containerHeight: 500,
        fontSize: 18,
        maxSegmentsPerPage: 6,
        firstPageExtraReservePx: 150,
      });
      const pagesWithCrest = measureAndPaginateSegments(denseSegments, {
        containerWidth: 460,
        containerHeight: 500,
        fontSize: 18,
        maxSegmentsPerPage: 6,
        firstPageExtraReservePx: 240,
      });

      expect(pagesWithCrest[0].length).toBeLessThanOrEqual(pagesDefault[0].length);
      expect(pagesWithCrest[0].length).toBeLessThan(pagesWithCrest.flat().length);
    });

    it('createBookSpreads creates paired two-page spreads with left and right indices', () => {
      const pages = [['seg1', 'seg2'], ['seg3'], ['seg4']];
      const spreads = createBookSpreads(pages);

      expect(spreads.length).toBe(2);
      expect(spreads[0].leftPage).toEqual(['seg1', 'seg2']);
      expect(spreads[0].rightPage).toEqual(['seg3']);
      expect(spreads[0].leftPageNum).toBe(1);
      expect(spreads[0].rightPageNum).toBe(2);
      expect(spreads[1].leftPage).toEqual(['seg4']);
      expect(spreads[1].rightPage).toEqual([]);
      expect(spreads[1].isLastSpread).toBe(true);
    });

    it('process4PassSegment separates borders, audio highlights, justified typography, and rich spans', () => {
      const processed = process4PassSegment(sampleSegments[1], 1, 0.4); // Dialogue segment with progress

      expect(processed.segId).toBe(2);
      expect(processed.pass1Border.isDialogue).toBe(true);
      expect(processed.pass1Border.borderLeft).toContain('border-l-2');
      expect(processed.pass2Highlight.isActive).toBe(false); // segId 2 != activeSegmentId 1
      expect(processed.pass3Typography.align).toBe('text-justify');
      expect(processed.pass4Spans.speakerName).toBe('Mr. Dursley');
    });
  });

  describe('2. pageSnapshotBridge Unit Tests', () => {
    it('renderPageToCanvas generates canvas with width and height scaling for DPR', () => {
      const canvas = renderPageToCanvas(sampleSegments.slice(0, 2), 400, 600, {
        isDark: false,
        novelTitle: 'HP1',
        chapterTitle: 'Chapter 1',
        pageNumber: 1,
      });

      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas.width).toBeGreaterThanOrEqual(400);
      expect(canvas.height).toBeGreaterThanOrEqual(600);
    });

    it('createReverseSideTexture handles horizontal mirror flipping', () => {
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = 300;
      sourceCanvas.height = 400;

      const reverseCanvas = createReverseSideTexture(sourceCanvas);
      expect(reverseCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(reverseCanvas.width).toBe(300);
      expect(reverseCanvas.height).toBe(400);
    });
  });

  describe('3. OpenGLPageReader Navigation & Focus Mode Tests', () => {
    it('Prev Page button correctly handles Spread 0 cover transitions without getting stuck', () => {
      render(
        <OpenGLPageReader
          segments={sampleSegments}
          activeSegmentId={1}
          currentNovel={mockNovelWithCover}
        />
      );

      // On initial render at Spread 0 with prose (showCoverSpread is false)
      const prevBtn = screen.getByRole('button', { name: /Previous Page/i });
      const nextBtn = screen.getAllByRole('button', { name: /Next Page/i })[0];

      // Because novel has a cover and prose is showing, Prev Page is ENABLED to flip back to Cover!
      expect(prevBtn).not.toBeDisabled();
      expect(nextBtn).not.toBeDisabled();

      // Click Prev Page: transitions to Cover Spread
      fireEvent.click(prevBtn);

      // Now on Cover Spread: cover artwork showcase is rendered
      expect(screen.getByText(/Deluxe Illustrated Edition/i)).toBeInTheDocument();

      // On Cover Spread, Prev Page is now disabled (we are at the very beginning)
      expect(prevBtn).toBeDisabled();

      // Click Next Page from Cover Spread: returns to prose Spread 0
      fireEvent.click(nextBtn);
      expect(screen.getByText(/Page 1 of/i)).toBeInTheDocument();
      // Prev Page is enabled again
      expect(prevBtn).not.toBeDisabled();
    });

    it('Prev Page button is disabled on Spread 0 if novel has no cover', () => {
      render(
        <OpenGLPageReader
          segments={sampleSegments}
          activeSegmentId={1}
          currentNovel={mockNovelNoCover}
        />
      );

      const prevBtn = screen.getByRole('button', { name: /Previous Page/i });
      // On Spread 0 with no cover object, cannot go back
      expect(prevBtn).toBeDisabled();
    });

    it('Focus Mode expands book layout to edge-to-edge viewport container', () => {
      const handleToggleFocus = vi.fn();
      render(
        <OpenGLPageReader
          segments={sampleSegments}
          activeSegmentId={1}
          currentNovel={mockNovelWithCover}
          isFocusMode={true}
          onToggleFocusMode={handleToggleFocus}
        />
      );

      // Focus Mode full-viewport root
      const exitBtn = screen.getByRole('button', { name: /Exit Focus/i });
      expect(exitBtn).toBeInTheDocument();

      // Verify book stage has focus mode responsive classes
      const container = document.querySelector('.min-h-\\[calc\\(100vh-140px\\)\\]');
      expect(container).toBeInTheDocument();

      fireEvent.click(exitBtn);
      expect(handleToggleFocus).toHaveBeenCalledTimes(1);
    });

    it('renders Left and Right page content containers with overflow-hidden and zero overflow-y-auto', () => {
      const { container } = render(
        <OpenGLPageReader
          segments={sampleSegments}
          activeSegmentId={1}
          currentNovel={mockNovelNoCover}
        />
      );

      expect(container.querySelectorAll('.overflow-y-auto').length).toBe(0);
      expect(container.querySelectorAll('.overflow-hidden').length).toBeGreaterThanOrEqual(2);
    });
  });
});
