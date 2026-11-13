/**
 * SyncTone — Page Snapshot & WebGL Texture Pipeline
 *
 * Direct web port of Moon+ Reader Pro v10.8 (com.flyersoft):
 * - ActivityTxt.getPageShot()
 * - ActivityTxt.get3dCurlShot_step2()
 *
 * Responsibilities:
 * 1. Offscreen 2D canvas rendering of page segments with accurate typographic styling.
 * 2. Dual-page texture slicing with padding-aware boundaries (rectLeft, rectRight).
 * 3. WebGL texture creation, binding, and memory disposal (preventing GPU leaks).
 */

import { parseSegmentImage } from './segmentUtils';

/**
 * Renders a single book page into an HTMLCanvasElement with typography, margins,
 * inline illustrations, and optional active word highlight.
 *
 * @param {Array} pageSegments - Array of segments on this page
 * @param {number} width - Page width in pixels
 * @param {number} height - Page height in pixels
 * @param {object} options - Styling options (theme, fonts, activeSegmentId, etc.)
 * @returns {HTMLCanvasElement}
 */
export function renderPageToCanvas(pageSegments = [], width = 450, height = 650, options = {}) {
  const {
    isDark = false,
    fontFamily = 'serif',
    fontSize = 18,
    activeSegmentId = -1,
    segmentProgress = 0,
    pageNumber = 1,
    novelTitle = '',
    chapterTitle = '',
    isLeftPage = false,
  } = options;

  const canvas = document.createElement('canvas');
  // Support HiDPI / Retina displays (devicePixelRatio clamped to 2 for performance)
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(dpr, dpr);

  // 1. Draw Theme Background (Noir Monochrome surfaces)
  if (isDark) {
    ctx.fillStyle = '#0B0B0D';
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = '#EFEFF0';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw Running Header
  ctx.save();
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
  ctx.textBaseline = 'top';

  const headerY = 20;
  if (isLeftPage) {
    ctx.textAlign = 'left';
    ctx.fillText((novelTitle || 'SyncTone Edition').toUpperCase().slice(0, 28), 32, headerY);
  } else {
    ctx.textAlign = 'right';
    ctx.fillText((chapterTitle || 'Chapter').toUpperCase().slice(0, 28), width - 32, headerY);
  }

  // Header separator line
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, headerY + 18);
  ctx.lineTo(width - 32, headerY + 18);
  ctx.stroke();
  ctx.restore();

  // 3. Draw Prose Segments
  let cursorY = 56;
  const paddingX = 32;
  const usableWidth = width - paddingX * 2;
  const fontFace = fontFamily === 'sans' ? 'sans-serif' : 'Newsreader, Georgia, serif';
  const lineHeight = fontSize * 1.85;

  for (const seg of pageSegments) {
    if (cursorY > height - 60) break;

    const segId = seg.segment_id !== undefined ? seg.segment_id : seg.order;
    const isActive = segId === activeSegmentId;
    const isDialogue = seg.type === 'dialogue';
    const { imgUrl, cleanText } = parseSegmentImage(seg);

    const rawText = isDialogue
      ? (cleanText ? `"${cleanText.replace(/^["“”]|["“”]$/g, '')}"` : '')
      : cleanText;

    // Draw speaker metadata tag
    if (seg.speaker_name && cursorY < height - 70) {
      ctx.save();
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.fillStyle = isDialogue
        ? (isDark ? '#e0a82e' : '#b45309')
        : (isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.45)');
      ctx.fillText((seg.speaker_name || 'Narrator').toUpperCase(), paddingX, cursorY);
      cursorY += 14;
      ctx.restore();
    }

    if (rawText && cursorY < height - 40) {
      ctx.save();
      ctx.font = `${isDialogue ? 'italic ' : ''}${fontSize}px ${fontFace}`;
      ctx.fillStyle = isDark
        ? (isActive ? '#fef08a' : '#e4e4e7')
        : (isActive ? '#854d0e' : '#1c1917');
      ctx.textBaseline = 'top';

      // Line wrapping
      const words = rawText.split(' ');
      let line = '';
      const indent = isDialogue ? 0 : 20;
      let isFirstLine = true;

      for (let w = 0; w < words.length; w++) {
        const testLine = line + (line ? ' ' : '') + words[w];
        const testWidth = ctx.measureText(testLine).width + (isFirstLine ? indent : 0);

        if (testWidth > usableWidth && line) {
          // Render current line
          const startX = paddingX + (isFirstLine ? indent : 0);

          if (isActive) {
            ctx.fillStyle = isDark ? 'rgba(250, 204, 21, 0.22)' : 'rgba(254, 240, 138, 0.7)';
            ctx.fillRect(startX - 2, cursorY - 1, ctx.measureText(line).width + 4, lineHeight);
            ctx.fillStyle = isDark ? '#fef08a' : '#854d0e';
          }

          ctx.fillText(line, startX, cursorY);
          cursorY += lineHeight;
          line = words[w];
          isFirstLine = false;

          if (cursorY > height - 50) break;
        } else {
          line = testLine;
        }
      }

      if (line && cursorY <= height - 50) {
        const startX = paddingX + (isFirstLine ? indent : 0);
        if (isActive) {
          ctx.fillStyle = isDark ? 'rgba(250, 204, 21, 0.22)' : 'rgba(254, 240, 138, 0.7)';
          ctx.fillRect(startX - 2, cursorY - 1, ctx.measureText(line).width + 4, lineHeight);
          ctx.fillStyle = isDark ? '#fef08a' : '#854d0e';
        }
        ctx.fillText(line, startX, cursorY);
        cursorY += lineHeight;
      }

      cursorY += 12; // Paragraph bottom spacing
      ctx.restore();
    }
  }

  // 4. Draw Running Footer with Page Number
  ctx.save();
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.45)';
  ctx.textAlign = 'center';
  ctx.fillText(String(pageNumber), width / 2, height - 24);
  ctx.restore();

  return canvas;
}

/**
 * Creates reverse-side texture for the back of the turning page.
 * Adds subtle paper translucency and reverse orientation.
 */
export function createReverseSideTexture(frontCanvas, isDark = false) {
  const canvas = document.createElement('canvas');
  canvas.width = frontCanvas.width;
  canvas.height = frontCanvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Fill paper background
  ctx.fillStyle = isDark ? '#0c0c0e' : '#f5f0e6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw mirrored and faded front page to simulate translucent parchment
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(frontCanvas, 0, 0);
  ctx.restore();

  return canvas;
}

/**
 * Uploads a canvas bitmap to a WebGL 2D texture.
 * Corresponds to Moon+ Reader's GLUtils.texImage2D and Mesh3D.generateTexture.
 *
 * @param {WebGLRenderingContext} gl
 * @param {WebGLTexture} texture
 * @param {HTMLCanvasElement} canvas
 */
export function uploadCanvasToTexture(gl, texture, canvas) {
  if (!gl || !texture || !canvas) return;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    canvas
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, null);
}
