/**
 * SyncTone — Audio Buffer Validator
 *
 * Validates synthesized PCM/WAV and MP3 audio buffers against format specifications
 * ensuring data integrity before persistence, streaming, or stitching.
 */

/**
 * Validates that an audio buffer contains valid headers and content for the specified format.
 *
 * @param {Buffer} buffer - Audio data buffer to validate
 * @param {string} [format='mp3'] - Expected audio format ('mp3', 'wav', 'wave')
 * @returns {boolean} True if buffer is valid for the specified format, false otherwise
 */
function validateAudioBuffer(buffer, format = 'mp3') {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  const fmt = String(format || 'mp3').toLowerCase().trim();

  if (fmt === 'wav' || fmt === 'wave') {
    // RIFF/WAVE header requires at least 44 bytes
    if (buffer.length < 44) {
      return false;
    }
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    return riff === 'RIFF' && wave === 'WAVE';
  }

  if (fmt === 'mp3') {
    // MP3 requires at least 4 bytes for either ID3 tag or MPEG sync word
    if (buffer.length < 4) {
      return false;
    }

    // 1. Check ID3v2 container header ('ID3')
    const hasId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
    if (hasId3) {
      return true;
    }

    // 2. Check MPEG audio frame sync word (0xFF followed by byte with top 3 bits set 0xE0)
    const hasSyncWord = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    if (hasSyncWord) {
      return true;
    }

    // 3. Scan first 1024 bytes in case sync word appears after metadata or padding
    const scanLimit = Math.min(buffer.length - 1, 1024);
    for (let i = 0; i < scanLimit; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
        return true;
      }
    }

    return false;
  }

  // Fallback for raw PCM or other formats: verify non-empty buffer
  return buffer.length > 0;
}

module.exports = {
  validateAudioBuffer,
};
module.exports.validateAudioBuffer = validateAudioBuffer;
module.exports.default = validateAudioBuffer;
