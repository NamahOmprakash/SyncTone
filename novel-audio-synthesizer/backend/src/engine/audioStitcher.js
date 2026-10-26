const fs = require('fs');
const path = require('path');
const { config } = require('../config');

class AudioStitcher {
  constructor() {
    this.sampleRate = config.audio.sampleRate;
    this.pauseMs = config.audio.interSpeakerPauseMs;
  }

  createWavHeader(dataByteLength, sampleRate = this.sampleRate, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataByteLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataByteLength, 40);

    return header;
  }

  createPcmSilenceBuffer(durationMs) {
    const sampleCount = Math.floor((this.sampleRate * durationMs) / 1000);
    return Buffer.alloc(sampleCount * 2);
  }

  createMp3SilenceBuffer(durationMs) {
    // MPEG-2 Layer 3, 24kHz, 48kbps mono = 144 bytes per frame (24ms per frame)
    const frameCount = Math.max(1, Math.round(durationMs / 24));
    const frame = Buffer.alloc(144, 0);
    frame[0] = 0xff;
    frame[1] = 0xf3;
    frame[2] = 0x60; // 48 kbps index (0110) MPEG-2 Layer 3, 24kHz = 144 bytes per frame
    frame[3] = 0xc0;
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(frame);
    }
    return Buffer.concat(frames);
  }

  transcodePcmToMp3(pcmBuffer) {
    try {
      const { spawnSync } = require('child_process');
      const res = spawnSync('ffmpeg', [
        '-f', 's16le',
        '-ar', String(this.sampleRate),
        '-ac', '1',
        '-i', 'pipe:0',
        '-f', 'mp3',
        '-b:a', '48k',
        'pipe:1',
      ], { input: pcmBuffer, maxBuffer: 10 * 1024 * 1024 });

      if (res.status === 0 && res.stdout && res.stdout.length > 0) {
        return res.stdout;
      }
    } catch (_err) {}
    // Fallback: return silence MP3 frame matching duration
    const durMs = Math.round((pcmBuffer.length / (this.sampleRate * 2)) * 1000);
    return this.createMp3SilenceBuffer(durMs);
  }

  stitch(segments, chapterId) {
    const outputDir = config.paths.outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timeline = [];
    const audioChunks = [];
    let currentMs = 0;
    let hasMp3 = false;
    let hasPcm = false;

    for (const seg of segments) {
      if (seg.format === 'mp3') hasMp3 = true;
      else hasPcm = true;
    }

    const targetFormat = hasMp3 || !hasPcm ? 'mp3' : 'wav';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let buffer = seg.audio_buffer || seg.pcm_buffer || Buffer.alloc(0);
      const durationMs = seg.duration_ms || 0;

      // Insert pause between segments if configured
      if (i > 0 && this.pauseMs > 0) {
        const pauseBuffer = targetFormat === 'mp3'
          ? this.createMp3SilenceBuffer(this.pauseMs)
          : this.createPcmSilenceBuffer(this.pauseMs);
        audioChunks.push(pauseBuffer);
        currentMs += this.pauseMs;
      }

      // Format normalization if mixed formats present
      if (targetFormat === 'mp3' && seg.format !== 'mp3' && buffer.length > 0) {
        buffer = this.transcodePcmToMp3(buffer);
      }

      const startMs = currentMs;
      const endMs = startMs + durationMs;

      audioChunks.push(buffer);
      currentMs = endMs;

      const order = seg.order || seg.segment_id || (i + 1);
      timeline.push({
        order,
        segment_id: seg.segment_id || order,
        start_ms: startMs,
        end_ms: endMs,
        speaker_name: seg.speaker_name || seg.character_id || 'Narrator',
        character_id: seg.character_id || seg.speaker_name || 'narrator',
        voice_id: seg.voice_id || 'am_adam',
        text: seg.text || '',
      });
    }

    let finalAudioBuffer;
    let audioFormat = targetFormat;
    let outputFilename = `${chapterId}.${audioFormat}`;

    if (audioFormat === 'mp3') {
      finalAudioBuffer = Buffer.concat(audioChunks);
    } else {
      const allPcm = Buffer.concat(audioChunks);
      const wavHeader = this.createWavHeader(allPcm.length);
      finalAudioBuffer = Buffer.concat([wavHeader, allPcm]);
    }

    const audioFilePath = path.join(outputDir, outputFilename);
    fs.writeFileSync(audioFilePath, finalAudioBuffer);

    return {
      chapter_id: chapterId,
      audio_stream_url: `/api/stream/${chapterId}`,
      audio_url: `/api/stream/${chapterId}`,
      audio_format: audioFormat,
      total_duration_ms: currentMs,
      timeline,
    };
  }

  stitchAudioSegments(segments, chapterId) {
    return this.stitch(segments, chapterId);
  }
}

const audioStitcher = new AudioStitcher();

module.exports = {
  audioStitcher,
};
