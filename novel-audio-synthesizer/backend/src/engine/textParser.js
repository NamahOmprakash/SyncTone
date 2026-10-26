const DIALOGUE_PATTERN = /(?:["\u201c]([^"\u201d]+)["\u201d]|\u2018((?:[^\u2018\u2019]|(?<=[a-zA-Z])\u2019(?=[a-zA-Z])){2,})\u2019)/g;

const SPEECH_VERBS = [
  'said', 'replied', 'shouted', 'whispered', 'muttered', 'exclaimed', 'asked',
  'cried', 'called', 'growled', 'hissed', 'stammered', 'yelled', 'snapped', 'sighed',
  'murmured', 'remarked', 'answered', 'demanded', 'insisted', 'pleaded', 'declared',
  'suggested', 'added', 'continued', 'began', 'interrupted', 'warned', 'promised',
  'admitted', 'announced', 'argued', 'begged', 'boasted', 'breathed', 'chanted',
  'chuckled', 'commented', 'complained', 'confessed', 'echoed', 'gasped', 'giggled',
  'groaned', 'grumbled', 'laughed', 'lied', 'moaned', 'mumbled', 'nagged', 'noted',
  'objected', 'observed', 'offered', 'ordered', 'panted', 'quoted', 'recalled',
  'repeated', 'reported', 'responded', 'retorted', 'roared', 'sang', 'screamed',
  'shrieked', 'sobbed', 'spoke', 'squealed', 'stated', 'stuttered', 'teased', 'thought',
  'thundered', 'urged', 'uttered', 'vowed', 'wailed', 'wept', 'wondered'
].join('|');

const SPEECH_TAG_AFTER = new RegExp(
  `["\\u201d\\u2019]\\s*[,.]?\\s+(\\w[\\w\\s]{0,30})\\s+(?:${SPEECH_VERBS})`,
  'i'
);

const SPEECH_TAG_AFTER_INVERTED = new RegExp(
  `["\\u201d\\u2019]\\s*[,.]?\\s*(?:${SPEECH_VERBS})\\s+(\\w[\\w\\s]{0,30})`,
  'i'
);

const SPEECH_TAG_BEFORE = new RegExp(
  `(\\w[\\w\\s]{0,30})\\s+(?:${SPEECH_VERBS})\\s*[,:]?\\s*["\\u201c\\u2018]`,
  'i'
);

function cleanSpeakerName(raw) {
  const noiseWords = new Set(['the', 'a', 'an', 'then', 'and', 'but', 'as', 'when', 'while', 'to']);
  const pronouns = new Set(['he', 'she', 'they', 'it']);
  const words = raw.trim().split(/\s+/);
  while (words.length > 0 && noiseWords.has(words[0].toLowerCase())) {
    words.shift();
  }
  const name = words.join(' ').trim().replace(/[.,!?;:]+$/, '');
  if (!name || words.length > 3) return '';
  if (pronouns.has(name.toLowerCase())) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  if (name[0] === name[0].toLowerCase()) return '';
  return name;
}

function extractSpeakerRegex(paragraph) {
  const matchAfter = paragraph.match(SPEECH_TAG_AFTER);
  if (matchAfter) {
    const name = cleanSpeakerName(matchAfter[1]);
    if (name) return { name, source: 'regex_rule' };
  }

  const matchAfterInv = paragraph.match(SPEECH_TAG_AFTER_INVERTED);
  if (matchAfterInv) {
    const name = cleanSpeakerName(matchAfterInv[1]);
    if (name) return { name, source: 'regex_rule' };
  }

  const matchBefore = paragraph.match(SPEECH_TAG_BEFORE);
  if (matchBefore) {
    const name = cleanSpeakerName(matchBefore[1]);
    if (name) return { name, source: 'regex_rule' };
  }

  return { name: '', source: 'unresolved' };
}

function parseChapter(rawText, title = 'Untitled Chapter', chapterId = 'ch-1') {
  const paragraphs = rawText
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const segments = [];
  let segmentIdCounter = 1;

  for (const paragraph of paragraphs) {
    const dialogueMatches = [];
    let match;
    const regex = new RegExp(DIALOGUE_PATTERN.source, 'g');

    while ((match = regex.exec(paragraph)) !== null) {
      const dialogueText = match[1] !== undefined ? match[1] : match[2];
      dialogueMatches.push({
        text: dialogueText,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    if (dialogueMatches.length === 0) {
      segments.push({
        segment_id: segmentIdCounter++,
        type: 'narration',
        speaker_name: 'Narrator',
        speaker_id: 'narrator',
        assigned_voice_id: 'af_heart',
        text: paragraph,
        attribution_confidence: 1.0,
        attribution_source: 'narrator_default',
      });
      continue;
    }

    const { name: extractedSpeaker, source: attrSource } = extractSpeakerRegex(paragraph);
    const speakerName = extractedSpeaker || 'Unknown Speaker';
    const speakerId = extractedSpeaker
      ? extractedSpeaker.toLowerCase().replace(/[^a-z0-9]/g, '_')
      : 'unresolved';

    let lastIdx = 0;
    for (const d of dialogueMatches) {
      if (d.start > lastIdx) {
        const narrationText = paragraph.substring(lastIdx, d.start).trim();
        if (narrationText.length > 0) {
          segments.push({
            segment_id: segmentIdCounter++,
            type: 'narration',
            speaker_name: 'Narrator',
            speaker_id: 'narrator',
            assigned_voice_id: 'af_heart',
            text: narrationText,
            attribution_confidence: 1.0,
            attribution_source: 'narrator_default',
          });
        }
      }

      segments.push({
        segment_id: segmentIdCounter++,
        type: 'dialogue',
        speaker_name: speakerName,
        speaker_id: speakerId,
        assigned_voice_id: 'am_adam',
        text: d.text,
        attribution_confidence: extractedSpeaker ? 0.85 : 0.4,
        attribution_source: extractedSpeaker ? attrSource : 'unresolved',
      });

      lastIdx = d.end;
    }

    if (lastIdx < paragraph.length) {
      const trailingNarration = paragraph.substring(lastIdx).trim();
      if (trailingNarration.length > 0) {
        segments.push({
          segment_id: segmentIdCounter++,
          type: 'narration',
          speaker_name: 'Narrator',
          speaker_id: 'narrator',
          assigned_voice_id: 'af_heart',
          text: trailingNarration,
          attribution_confidence: 1.0,
          attribution_source: 'narrator_default',
        });
      }
    }
  }

  return {
    chapter_id: chapterId,
    title,
    segments,
  };
}

module.exports = {
  parseChapter,
};
