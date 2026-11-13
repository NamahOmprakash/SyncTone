import { describe, it, expect } from 'vitest';
import {
  sanitizeTextWithTtsDomCleaner,
  sanitizeChaptersWithTtsDomCleaner,
  sanitizeSegmentsWithTtsDomCleaner,
} from '../utils/ttsSanitizer';

describe('ttsSanitizer Golden Tests', () => {
  it('handles empty and null inputs safely', () => {
    expect(sanitizeTextWithTtsDomCleaner('')).toBe('');
    expect(sanitizeTextWithTtsDomCleaner(null)).toBe('');
    expect(sanitizeTextWithTtsDomCleaner(undefined)).toBe('');
    expect(sanitizeTextWithTtsDomCleaner('   \n\n  \t  ')).toBe('');
  });

  it('preserves clean text paragraphs and normalizes whitespace', () => {
    const input = '<p>First paragraph with   extra    spaces.</p><p>Second paragraph on a new line.</p>';
    const expected = 'First paragraph with extra spaces.\n\nSecond paragraph on a new line.';
    expect(sanitizeTextWithTtsDomCleaner(input)).toBe(expected);
  });

  it('strips junk tags (script, style, noscript, svg, template, iframe, canvas)', () => {
    const input = `
      <p>Clean text before.</p>
      <script>var bad = 1; window.alert("xss");</script>
      <style>body { display: none !important; }</style>
      <noscript><p>No script notice</p></noscript>
      <template><p>Template content</p></template>
      <svg width="10" height="10"><circle cx="5" cy="5" r="5"/></svg>
      <iframe src="https://example.com"></iframe>
      <canvas width="100" height="100"></canvas>
      <p>Clean text after.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toContain('Clean text before.');
    expect(result).toContain('Clean text after.');
    expect(result).not.toContain('bad = 1');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('display: none');
    expect(result).not.toContain('No script notice');
    expect(result).not.toContain('Template content');
  });

  it('strips elements hidden by hidden attribute, aria-hidden, or CSS styles', () => {
    const input = `
      <p>Visible start.</p>
      <div hidden>Hidden by attribute</div>
      <div aria-hidden="true">Hidden by aria-hidden</div>
      <div aria-hidden="false">Visible despite aria attribute</div>
      <span style="display: none">Hidden by display:none</span>
      <span style="DISPLAY:   NONE !important;">Hidden by uppercase display none</span>
      <div style="visibility: hidden">Hidden by visibility:hidden</div>
      <p style="opacity: 0">Hidden by zero opacity</p>
      <p style="font-size: 0px">Hidden by zero font size px</p>
      <span style="font-size: 0rem">Hidden by zero font size rem</span>
      <p>Visible end.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toContain('Visible start.');
    expect(result).toContain('Visible despite aria attribute');
    expect(result).toContain('Visible end.');
    expect(result).not.toContain('Hidden by attribute');
    expect(result).not.toContain('Hidden by aria-hidden');
    expect(result).not.toContain('Hidden by display:none');
    expect(result).not.toContain('Hidden by uppercase display none');
    expect(result).not.toContain('Hidden by visibility:hidden');
    expect(result).not.toContain('Hidden by zero opacity');
    expect(result).not.toContain('Hidden by zero font size px');
    expect(result).not.toContain('Hidden by zero font size rem');
  });

  it('strips ad, watermark, and scraper classes', () => {
    const input = `
      <p>Chapter opening.</p>
      <div class="ad">Advert text here</div>
      <div class="watermark">Scraped by pirate website</div>
      <p class="patreon-box">Please support us on Patreon!</p>
      <span class="hidden">Hidden class text</span>
      <span class="sr-only">Screen reader accessibility note</span>
      <p>Chapter continuation.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toContain('Chapter opening.');
    expect(result).toContain('Chapter continuation.');
    expect(result).not.toContain('Advert text here');
    expect(result).not.toContain('Scraped by pirate website');
    expect(result).not.toContain('Please support us on Patreon!');
    expect(result).not.toContain('Hidden class text');
    expect(result).not.toContain('Screen reader accessibility note');
  });

  it('strips Internet Archive and scan disclaimer patterns', () => {
    const input = `
      <p>The text on this page is estimated to be only 87.5% accurate.</p>
      <p>This book was produced in EPUB format by the Internet Archive.</p>
      <p>The book pages were scanned and converted to EPUB format automatically.</p>
      <p>Actual prologue text begins here.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toBe('Actual prologue text begins here.');
  });

  it('strips ASCII dividers (***, ---, etc.) in HTML and plaintext', () => {
    const htmlInput = '<p>Before</p><p>***</p><p>* * *</p><p>---</p><p>___</p><p>===</p><p>After</p>';
    const cleanedHtml = sanitizeTextWithTtsDomCleaner(htmlInput);
    expect(cleanedHtml).toBe('Before\n\nAfter');

    const plainInput = 'Section One\n\n***\n\n---\n\nSection Two';
    const cleanedPlain = sanitizeTextWithTtsDomCleaner(plainInput);
    expect(cleanedPlain).toBe('Section One\n\nSection Two');
  });

  it('deduplicates consecutive identical paragraphs while preserving non-consecutive duplicates', () => {
    const input = `
      <p>Duplicate paragraph.</p>
      <p>Duplicate paragraph.</p>
      <p>Middle unique paragraph.</p>
      <p>Duplicate paragraph.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    const count = (result.match(/Duplicate paragraph\./g) || []).length;
    expect(count).toBe(2);
    expect(result).toBe('Duplicate paragraph.\n\nMiddle unique paragraph.\n\nDuplicate paragraph.');
  });

  it('handles malformed HTML and deeply nested tags cleanly', () => {
    const malformed = '<div><p>Unclosed paragraph <b>bold <i>bold italic</span></div><p>Follow up</p>';
    const result = sanitizeTextWithTtsDomCleaner(malformed);
    expect(result).toContain('Unclosed paragraph bold bold italic');
    expect(result).toContain('Follow up');
  });

  it('decodes HTML entities properly without double escaping', () => {
    const input = '<p>Tom &amp; Jerry went to the caf&eacute; &#8212; &quot;Quick!&quot; he said &lt;here&gt;.</p>';
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toBe('Tom & Jerry went to the café — "Quick!" he said <here>.');
  });

  it('handles line breaks <br> inside paragraphs', () => {
    const input = '<p>Line one<br/>Line two<br>Line three</p><p>Next block</p>';
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toBe('Line one\nLine two\nLine three\n\nNext block');
  });

  it('converts <img> tags to [IMAGE:...] markers and preserves existing ones', () => {
    const input = `
      <p>Text before illustration.</p>
      <img src="https://cdn.example.com/illustrations/map.png" alt="Map" />
      <p>[IMAGE:/static/covers/cover.jpg]</p>
      <p>Text after illustration.</p>
    `;
    const result = sanitizeTextWithTtsDomCleaner(input);
    expect(result).toContain('Text before illustration.');
    expect(result).toContain('[IMAGE:https://cdn.example.com/illustrations/map.png]');
    expect(result).toContain('[IMAGE:/static/covers/cover.jpg]');
    expect(result).toContain('Text after illustration.');
  });

  it('processes chapters with sanitizeChaptersWithTtsDomCleaner', () => {
    const chapters = [
      {
        chapter_number: 1,
        title: 'Ch 1',
        raw_text: '<p>First line</p><p>***</p><p>Second line</p>',
      },
    ];
    const cleaned = sanitizeChaptersWithTtsDomCleaner(chapters);
    expect(cleaned[0].raw_text).toBe('First line\n\nSecond line');
  });

  it('processes segments with sanitizeSegmentsWithTtsDomCleaner', () => {
    const segments = [
      { order: 1, text: 'Opening sentence' },
      { order: 2, text: '***' },
      { order: 3, text: 'Repeated text' },
      { order: 4, text: 'Repeated text' },
      { order: 5, text: '[IMAGE:img.png]' },
    ];
    const cleaned = sanitizeSegmentsWithTtsDomCleaner(segments);
    expect(cleaned.length).toBe(3);
    expect(cleaned[0].text).toBe('Opening sentence');
    expect(cleaned[1].text).toBe('Repeated text');
    expect(cleaned[2].text).toBe('[IMAGE:img.png]');
  });
});

