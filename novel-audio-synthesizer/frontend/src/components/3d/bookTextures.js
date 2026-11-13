import * as THREE from 'three';

/**
 * Procedural Page Edge Texture
 * Simulates thousands of paper leaf edges pressed together in a hardcover book block.
 */
export function createPageEdgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Archival cream base
  ctx.fillStyle = '#F4EDE0';
  ctx.fillRect(0, 0, 512, 128);

  // Subtle paper page layers (hundreds of thin striations)
  ctx.lineWidth = 1;
  for (let y = 0; y < 128; y += 1.5) {
    const alpha = 0.08 + Math.random() * 0.12;
    ctx.strokeStyle = `rgba(168, 150, 130, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Edge shading gradient (darker near the hinge/binding)
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(0.08, 'rgba(0, 0, 0, 0.04)');
  grad.addColorStop(0.92, 'rgba(0, 0, 0, 0.04)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Spine Texture for a given novel
 * Generates an authentic embossed cloth/leather spine with gold foil accents,
 * vertical title, author, and volume number.
 */
export function createSpineTexture(novel, volumeNumber = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Rich noir leatherette base
  ctx.fillStyle = '#141418';
  ctx.fillRect(0, 0, 160, 1024);

  // Subtle leather noise grain
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 160;
    const y = Math.random() * 1024;
    const v = Math.random() * 15;
    ctx.fillStyle = `rgba(255, 255, 255, ${v / 255})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Curvature shading: darker at the edges, highlight down the spine center
  const curveGrad = ctx.createLinearGradient(0, 0, 160, 0);
  curveGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  curveGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.08)');
  curveGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
  curveGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.08)');
  curveGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
  ctx.fillStyle = curveGrad;
  ctx.fillRect(0, 0, 160, 1024);

  // Gold foil ribbing / headbands (top and bottom)
  const drawRibbon = (y) => {
    ctx.fillStyle = '#C5A059';
    ctx.fillRect(16, y, 128, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(16, y, 128, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(16, y + 3, 128, 1);
  };

  drawRibbon(40);
  drawRibbon(50);
  drawRibbon(974);
  drawRibbon(984);

  // Volume badge at top
  ctx.save();
  ctx.fillStyle = '#C5A059';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`VOL. ${String(volumeNumber).padStart(2, '0')}`, 80, 110);
  ctx.restore();

  // Vertical Novel Title
  ctx.save();
  ctx.translate(80, 520);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F2F2F5';
  ctx.font = 'bold 32px "Inter", sans-serif';
  const title = (novel?.title || 'SYNCTONE CLASSIC').toUpperCase();
  const truncatedTitle = title.length > 32 ? title.slice(0, 30) + '…' : title;
  ctx.fillText(truncatedTitle, 0, 8);
  ctx.restore();

  // Author near bottom
  ctx.save();
  ctx.translate(80, 860);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#A9A9B2';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  const author = (novel?.author_username || 'AUTHOR').toUpperCase();
  const truncatedAuthor = author.length > 24 ? author.slice(0, 22) + '…' : author;
  ctx.fillText(truncatedAuthor, 0, 6);
  ctx.restore();

  // SyncTone emblem imprint at very bottom
  ctx.save();
  ctx.fillStyle = '#C5A059';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SYNCTONE', 80, 940);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Back Cover Texture
 * Elegant dark hardcover back plate with debossed border, synopsis excerpt, and publisher colophon.
 */
export function createBackCoverTexture(novel) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // Hardcover base
  ctx.fillStyle = '#111115';
  ctx.fillRect(0, 0, 512, 768);

  // Subtle linen / leather texture
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 768;
    const v = Math.random() * 12;
    ctx.fillStyle = `rgba(255, 255, 255, ${v / 255})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // MinaLima / Noir Inset Gold Frame
  ctx.strokeStyle = 'rgba(197, 160, 89, 0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 456, 712);

  ctx.strokeStyle = 'rgba(197, 160, 89, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(36, 36, 440, 696);

  // SyncTone Monogram / Crest
  ctx.fillStyle = '#C5A059';
  ctx.font = 'bold 24px "Newsreader", serif';
  ctx.textAlign = 'center';
  ctx.fillText('SYNCTONE CLASSICS', 256, 95);

  ctx.fillStyle = 'rgba(197, 160, 89, 0.5)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.fillText('NEURAL DRAMATIZATION // MULTI-VOICE CAST', 256, 120);

  // Decorative divider
  ctx.strokeStyle = 'rgba(197, 160, 89, 0.35)';
  ctx.beginPath();
  ctx.moveTo(170, 140);
  ctx.lineTo(342, 140);
  ctx.stroke();

  // Synopsis text
  const synopsis =
    novel?.synopsis ||
    'An enduring literary masterpiece dynamically scored with generative ambient soundscapes, character voice assignment, and synchronized reading text.';
  ctx.fillStyle = '#D6D6DC';
  ctx.font = 'italic 17px "Newsreader", serif';
  ctx.textAlign = 'left';

  // Multi-line wrap
  const words = synopsis.split(' ');
  let line = '';
  let y = 185;
  const maxWidth = 400;
  for (let n = 0; n < words.length && y < 580; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 56, y);
      line = words[n] + ' ';
      y += 28;
    } else {
      line = testLine;
    }
  }
  if (line && y < 580) {
    ctx.fillText(line, 56, y);
  }

  // Bottom Colophon & Barcode
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.moveTo(56, 610);
  ctx.lineTo(456, 610);
  ctx.stroke();

  // Simulated Barcode
  ctx.fillStyle = '#F2F2F5';
  let bx = 330;
  const barWidths = [2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 2, 3, 2, 1];
  for (const bw of barWidths) {
    ctx.fillRect(bx, 630, bw, 48);
    bx += bw + 2;
  }
  ctx.fillStyle = '#8E8E98';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ISBN 978-0-SYNCTONE', 330, 692);

  ctx.fillText('EDITION: OFFICIAL CANONICAL', 56, 645);
  ctx.fillText('MASTERED BY SYNCTONE STUDIO', 56, 665);
  ctx.fillText('HIGH-FIDELITY SPATIAL AUDIO', 56, 685);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

