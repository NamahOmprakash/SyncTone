import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  sanitizeTextWithTtsDomCleaner,
  sanitizeChaptersWithTtsDomCleaner,
  sanitizeSegmentsWithTtsDomCleaner,
} from '../utils/ttsSanitizer';
import AddNovelModal from '../components/AddNovelModal';
import UploadChapterModal from '../components/UploadChapterModal';
import ReaderView from '../components/ReaderView';
import { AuthProvider } from '../context/AuthContext';
import { api } from '../services/api';

// Mock ebookParser so this test suite does not depend on foliate/pdfjs binaries or external async parser
vi.mock('../utils/ebookParser', () => ({
  extractChaptersFromText: vi.fn((rawText, title) => [
    {
      chapter_number: 1,
      title: title ? `Chapter 1: ${title}` : 'Chapter 1',
      raw_text: rawText,
    },
  ]),
  parseNovelFileClientSide: vi.fn(),
  parseEbookWithFoliate: vi.fn(),
  parsePdfWithPdfJs: vi.fn(),
}));

describe('TTS DOM Sanitizer & Opt-in UI Toggles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizeTextWithTtsDomCleaner utility', () => {
    it('strips hidden scraper traps and zero-pixel watermarks', () => {
      const input = `
        <p>Legitimate opening sentence of the novel.</p>
        <span style="display:none">hidden scraper trap</span>
        <p style="font-size:0px">watermark</p>
        <p>Second legitimate sentence following the trap.</p>
      `;
      const cleaned = sanitizeTextWithTtsDomCleaner(input);

      expect(cleaned).toContain('Legitimate opening sentence of the novel.');
      expect(cleaned).toContain('Second legitimate sentence following the trap.');
      expect(cleaned).not.toContain('hidden scraper trap');
      expect(cleaned).not.toContain('watermark');
    });

    it('strips *** and --- ASCII dividers in both HTML and plaintext', () => {
      const htmlInput = `
        <p>Paragraph before divider.</p>
        <p>***</p>
        <p>Paragraph between dividers.</p>
        <p>---</p>
        <p>Paragraph after divider.</p>
      `;
      const cleanedHtml = sanitizeTextWithTtsDomCleaner(htmlInput);

      expect(cleanedHtml).toContain('Paragraph before divider.');
      expect(cleanedHtml).toContain('Paragraph between dividers.');
      expect(cleanedHtml).toContain('Paragraph after divider.');
      expect(cleanedHtml).not.toContain('***');
      expect(cleanedHtml).not.toContain('---');

      const plainInput = 'First section.\n\n***\n\n---\n\nSecond section.';
      const cleanedPlain = sanitizeTextWithTtsDomCleaner(plainInput);

      expect(cleanedPlain).toContain('First section.');
      expect(cleanedPlain).toContain('Second section.');
      expect(cleanedPlain).not.toContain('***');
      expect(cleanedPlain).not.toContain('---');
    });

    it('deduplicates consecutive identical paragraphs in HTML while preserving [IMAGE:...] markers', () => {
      const htmlInput = `
        <p>Sherlock Holmes looked out of the Baker Street window.</p>
        <p>Sherlock Holmes looked out of the Baker Street window.</p>
        <p>[IMAGE:/static/covers/test.jpg]</p>
        <p>It was a cold, foggy morning in London.</p>
      `;
      const cleaned = sanitizeTextWithTtsDomCleaner(htmlInput);

      // Verify consecutive duplicate is deduplicated
      const matches = cleaned.match(/Sherlock Holmes looked out of the Baker Street window\./g) || [];
      expect(matches.length).toBe(1);

      // Verify image marker is preserved
      expect(cleaned).toContain('[IMAGE:/static/covers/test.jpg]');
      expect(cleaned).toContain('It was a cold, foggy morning in London.');
    });

    it('deduplicates consecutive identical paragraphs in plaintext while preserving [IMAGE:...] markers', () => {
      const plainInput =
        'Repeated paragraph line.\n\nRepeated paragraph line.\n\n[IMAGE:/static/covers/test.jpg]\n\nUnique trailing line.';
      const cleaned = sanitizeTextWithTtsDomCleaner(plainInput);

      const matches = cleaned.match(/Repeated paragraph line\./g) || [];
      expect(matches.length).toBe(1);
      expect(cleaned).toContain('[IMAGE:/static/covers/test.jpg]');
      expect(cleaned).toContain('Unique trailing line.');
    });
  });

  describe('AddNovelModal opt-in sanitizer toggle', () => {
    it('defaults to OFF, cleans previewed chapters when toggled ON, and restores original when toggled OFF', async () => {
      const rawManuscript =
        '<p>The ancient gates swung open slowly.</p><span style="display:none">BOT_TRAP</span><p>***</p><p>Echoing footprints in stone.</p><p>Echoing footprints in stone.</p>';

      vi.spyOn(api.novels, 'parseFile').mockResolvedValue({
        title: 'The Whispering Gate',
        synopsis: 'A fantasy story about ancient caverns.',
        chapters: [
          {
            chapter_number: 1,
            title: 'Chapter 1: The Gateway',
            raw_text: rawManuscript,
          },
        ],
      });

      render(
        <AuthProvider>
          <AddNovelModal isOpen={true} onClose={vi.fn()} onNovelCreated={vi.fn()} />
        </AuthProvider>
      );

      // Verify default state of toggle is OFF
      const toggle = screen.getByTestId('tts-sanitizer-toggle');
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-checked', 'false');

      // Upload file to populate chapters
      const file = new File([rawManuscript], 'gate.epub', { type: 'application/epub+zip' });
      const fileInput = screen.getByTestId('novel-file-input');
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByDisplayValue('The Whispering Gate')).toBeInTheDocument();
        expect(screen.getByText('Preview Text')).toBeInTheDocument();
      });

      // Open Preview: while sanitizer is OFF, uncleaned raw text containing BOT_TRAP or *** is present
      fireEvent.click(screen.getByText('Preview Text'));
      expect(screen.getByText(/BOT_TRAP/i)).toBeInTheDocument();

      // Toggle sanitizer ON
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'true');

      // Preview should now show cleaned content: BOT_TRAP stripped
      await waitFor(() => {
        expect(screen.queryByText(/BOT_TRAP/i)).not.toBeInTheDocument();
        expect(screen.getByText(/The ancient gates swung open slowly/i)).toBeInTheDocument();
      });

      // Toggle sanitizer OFF again: restores original raw text
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-checked', 'false');

      await waitFor(() => {
        expect(screen.getByText(/BOT_TRAP/i)).toBeInTheDocument();
      });
    });
  });

  describe('ReaderView opt-in sanitizer toggle', () => {
    it('defaults to OFF, strips *** dividers and deduplicates segments when toggled ON, and restores them when OFF', () => {
      const mockSegments = [
        {
          order: 1,
          segment_id: 1,
          type: 'narration',
          text: 'The travelers arrived at the inn.',
        },
        {
          order: 2,
          segment_id: 2,
          type: 'narration',
          text: '***',
        },
        {
          order: 3,
          segment_id: 3,
          type: 'narration',
          text: 'They warmed themselves by the roaring fire.',
        },
        {
          order: 4,
          segment_id: 4,
          type: 'narration',
          text: 'They warmed themselves by the roaring fire.',
        },
        {
          order: 5,
          segment_id: 5,
          type: 'narration',
          text: 'The innkeeper brought hot stew.',
        },
      ];

      render(
        <ReaderView
          segments={mockSegments}
          activeSegmentId={1}
          currentNovel={{ title: 'Inn of Legends' }}
          currentChapter={{ title: 'Chapter 1' }}
        />
      );

      const readerToggle = screen.getByTestId('reader-tts-sanitizer-toggle');
      expect(readerToggle).toBeInTheDocument();
      expect(readerToggle).toHaveAttribute('aria-pressed', 'false');

      // Initially, *** divider and duplicate segment are both rendered
      expect(screen.getByText('***')).toBeInTheDocument();
      expect(screen.getAllByText('They warmed themselves by the roaring fire.').length).toBe(2);

      // Toggle ON
      fireEvent.click(readerToggle);
      expect(readerToggle).toHaveAttribute('aria-pressed', 'true');

      // *** divider is stripped and duplicate segment is deduplicated
      expect(screen.queryByText('***')).not.toBeInTheDocument();
      expect(screen.getAllByText('They warmed themselves by the roaring fire.').length).toBe(1);
      expect(screen.getByText('The travelers arrived at the inn.')).toBeInTheDocument();
      expect(screen.getByText('The innkeeper brought hot stew.')).toBeInTheDocument();

      // Toggle OFF: restores original untouched segments
      fireEvent.click(readerToggle);
      expect(readerToggle).toHaveAttribute('aria-pressed', 'false');

      expect(screen.getByText('***')).toBeInTheDocument();
      expect(screen.getAllByText('They warmed themselves by the roaring fire.').length).toBe(2);
    });
  });

  describe('UploadChapterModal opt-in sanitizer toggle', () => {
    it('cleans prose on submit when enabled, and leaves prose untouched when disabled', async () => {
      const uploadSpy = vi.spyOn(api.novels, 'uploadChapter').mockResolvedValue({
        chapter: { id: 'ch-test-1', title: 'Chapter 1', text: 'Cleaned' },
      });

      const novel = { id: 'novel-123', title: 'Test Novel' };
      const { rerender } = render(
        <UploadChapterModal
          isOpen={true}
          novel={novel}
          onClose={vi.fn()}
          onChapterUploaded={vi.fn()}
        />
      );

      const chapterToggle = screen.getByTestId('chapter-tts-sanitizer-toggle');
      expect(chapterToggle).toHaveAttribute('aria-checked', 'false');

      const rawText = '<p>Normal text</p><span style="display:none">SPAM_BOT</span><p>***</p>';
      const textarea = screen.getByPlaceholderText(/Paste raw prose text here/i);
      fireEvent.change(textarea, { target: { value: rawText } });

      // Submit while toggle is OFF -> text is submitted untouched
      fireEvent.click(screen.getByText('Upload & Parse Prose'));

      await waitFor(() => {
        expect(uploadSpy).toHaveBeenCalledWith(
          'novel-123',
          expect.objectContaining({
            text: rawText.trim(),
          })
        );
      });

      uploadSpy.mockClear();

      // Toggle ON and submit again
      fireEvent.click(chapterToggle);
      expect(chapterToggle).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByText('Upload & Parse Prose'));

      await waitFor(() => {
        expect(uploadSpy).toHaveBeenCalledWith(
          'novel-123',
          expect.objectContaining({
            text: 'Normal text',
          })
        );
      });
    });
  });
});
