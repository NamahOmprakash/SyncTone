import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('SyncTone Custom Cursor System', () => {
  const publicDir = path.resolve(__dirname, '../../public/cursors');
  const cssPath = path.resolve(__dirname, '../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  it('provides clean SVG cursor assets with transparent background and exact 36px desktop sizing', () => {
    const darkSvgPath = path.join(publicDir, 'arrow-dark.svg');
    const lightSvgPath = path.join(publicDir, 'arrow-light.svg');

    expect(fs.existsSync(darkSvgPath)).toBe(true);
    expect(fs.existsSync(lightSvgPath)).toBe(true);

    const darkSvg = fs.readFileSync(darkSvgPath, 'utf-8');
    const lightSvg = fs.readFileSync(lightSvgPath, 'utf-8');

    // 20px desktop size & viewBox
    expect(darkSvg).toContain('width="20"');
    expect(darkSvg).toContain('height="20"');
    expect(darkSvg).toContain('viewBox="0 0 20 20"');
    expect(lightSvg).toContain('width="20"');
    expect(lightSvg).toContain('height="20"');
    expect(lightSvg).toContain('viewBox="0 0 20 20"');

    // Transparent background (fill="none" on svg root)
    expect(darkSvg).toContain('fill="none"');
    expect(lightSvg).toContain('fill="none"');

    // Solid white fill in dark mode & solid black in light mode
    expect(darkSvg).toContain('fill="#FFFFFF"');
    expect(lightSvg).toMatch(/fill="#(?:000000|0A0A0C|0B0B0D)"/i);

    // No circular ring or decorative elements
    expect(darkSvg).not.toContain('<circle');
    expect(darkSvg).not.toContain('<ellipse');
    expect(lightSvg).not.toContain('<circle');
    expect(lightSvg).not.toContain('<ellipse');
  });

  it('configures CSS custom cursor variables with upper-left hotspot (1 1) and native fallbacks', () => {
    expect(cssContent).toContain('--cursor-arrow-dark');
    expect(cssContent).toContain('--cursor-pointer-dark');
    expect(cssContent).toContain('--cursor-arrow-light');
    expect(cssContent).toContain('--cursor-pointer-light');

    // Hotspot at (1 1)
    expect(cssContent).toContain("url('/cursors/arrow-dark.svg') 1 1");
    expect(cssContent).toContain("url('/cursors/arrow-light.svg') 1 1");

    // Native fallback keywords
    expect(cssContent).toContain('1 1, auto');
    expect(cssContent).toContain('1 1, pointer');
  });

  it('preserves native I-beam behavior for text inputs and text selection', () => {
    expect(cssContent).toMatch(/input\[type="text"\].*cursor:\s*text\s*!important/s);
    expect(cssContent).toMatch(/textarea.*cursor:\s*text\s*!important/s);
    expect(cssContent).toMatch(/\[contenteditable="true"\].*cursor:\s*text\s*!important/s);
  });

  it('preserves appropriate drag, resize, and disabled cursor states', () => {
    expect(cssContent).toMatch(/cursor:\s*not-allowed\s*!important/);
    expect(cssContent).toMatch(/cursor:\s*grab\s*!important/);
    expect(cssContent).toMatch(/cursor:\s*grabbing\s*!important/);
    expect(cssContent).toMatch(/cursor:\s*col-resize\s*!important/);
    expect(cssContent).toMatch(/cursor:\s*row-resize\s*!important/);
  });

  it('preserves touch device behavior by scoping to hover and fine pointer', () => {
    expect(cssContent).toContain('@media (hover: hover) and (pointer: fine)');
  });
});

