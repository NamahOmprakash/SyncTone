/**
 * SyncTone Engine - Literary Heuristic Text Parser & Turn-Taking State Machine
 *
 * Splits raw chapter prose into ordered `narration`, `dialogue`, and `image` segments,
 * handling Victorian/modern honorifics (Mr., Mrs., Dr., St., Prof., Lord, Sir, Lady),
 * mid-sentence interrupted speech tags, prepositional/adverbial tail stripping,
 * pronoun attribution (`I`, `he`, `she`), delayed lookahead tags, and conversational
 * turn-taking across paragraphs.
 */

'use strict';

const HONORIFIC_LIST = [
  'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'St', 'Prof', 'Rev', 'Sgt', 'Capt',
  'Col', 'Lt', 'Gen', 'Maj', 'Insp', 'Supt', 'Mme', 'Mlle', 'Fr', 'Sr', 'Jr',
];
const HONORIFIC_SET = new Set(HONORIFIC_LIST.map((h) => h.toLowerCase()));

const TITLE_PREFIX_WORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'st', 'prof', 'professor', 'rev', 'reverend',
  'sgt', 'sergeant', 'capt', 'captain', 'col', 'colonel', 'lt', 'lieutenant',
  'gen', 'general', 'maj', 'major', 'insp', 'inspector', 'supt', 'superintendent',
  'mme', 'madame', 'mlle', 'mademoiselle', 'sir', 'lord', 'lady', 'dame',
  'king', 'queen', 'prince', 'princess', 'duke', 'duchess', 'count', 'countess',
  'baron', 'baroness', 'earl', 'father', 'brother', 'sister', 'mother', 'uncle',
  'aunt', 'doctor', 'judge', 'constable', 'officer', 'chief', 'dean', 'headmaster',
]);

const MALE_TITLES = new Set([
  'mr', 'sir', 'lord', 'king', 'prince', 'duke', 'baron', 'earl', 'count',
  'father', 'brother', 'uncle', 'prof', 'professor', 'insp', 'inspector',
  'capt', 'captain', 'col', 'colonel', 'gen', 'general', 'maj', 'major', 'sgt', 'sergeant',
]);

const FEMALE_TITLES = new Set([
  'mrs', 'ms', 'miss', 'lady', 'dame', 'queen', 'princess', 'duchess', 'countess',
  'baroness', 'mother', 'sister', 'aunt', 'mme', 'madame', 'mlle', 'mademoiselle',
]);

const MALE_NAMES = new Set([
  'sherlock', 'holmes', 'john', 'watson', 'lestrade', 'moriarty', 'mycroft',
  'jabez', 'henry', 'charles', 'arthur', 'james', 'william', 'harry', 'ron',
  'ronald', 'albus', 'dumbledore', 'severus', 'snape', 'draco', 'malfoy',
  'hagrid', 'rubeus', 'neville', 'tom', 'edward', 'george', 'fred', 'frank',
  'peter', 'paul', 'david', 'michael', 'robert', 'richard', 'thomas', 'daniel',
  'joseph', 'victor', 'dorian', 'atticus', 'frodo', 'gandalf', 'bilbo', 'sam',
  'samwise', 'gregory', 'vernon', 'dudley', 'oliver', 'percy', 'arthur', 'lucius',
  'sirius', 'remus', 'simon', 'wilson', 'gregson', 'tobias', 'hosmer', 'godfrey',
  'irene_brother', 'nevill', 'hugh', 'nathaniel', 'jonas', 'stephen', 'philip',
  'benjamin', 'martin', 'alex', 'alexander', 'nicholas', 'mark', 'luke', 'matthew',
  'jack', 'william', 'walter', 'albert', 'ernest', 'oscar', 'harold', 'herbert',
]);

const FEMALE_NAMES = new Set([
  'irene', 'adler', 'mary', 'hudson', 'sarah', 'alice', 'elizabeth', 'jane',
  'emma', 'hermione', 'granger', 'minerva', 'mcgonagall', 'ginny', 'luna',
  'molly', 'lily', 'petunia', 'clara', 'helen', 'violet', 'margaret',
  'catherine', 'anne', 'charlotte', 'eleanor', 'sophia', 'grace', 'rose',
  'lucy', 'martha', 'hannah', 'emily', 'rachel', 'rebecca', 'laura', 'anna',
  'kate', 'julia', 'edith', 'elsie', 'bertha', 'hester', 'beatrice', 'flora',
  'georgina', 'henrietta', 'hatty', 'stoper', 'violet', 'bessie', 'claire',
  'susan', 'patricia', 'linda', 'barbara', 'jennifer', 'dorothy', 'amy', 'chloe',
  'cho', 'lavender', 'parvati', 'padma', 'fleur', 'tonks', 'bellatrix',
]);

const STRICT_SPEECH_VERB_LIST = [
  'said', 'replied', 'asked', 'answered', 'whispered', 'shouted', 'yelled',
  'screamed', 'cried', 'exclaimed', 'muttered', 'murmured', 'mumbled',
  'groaned', 'gasped', 'snapped', 'growled', 'snarled', 'hissed', 'barked',
  'roared', 'called', 'declared', 'stated', 'announced', 'proclaimed',
  'pronounced', 'asserted', 'insisted', 'argued', 'protested', 'objected',
  'retorted', 'remarked', 'observed', 'noted', 'commented', 'added',
  'continued', 'resumed', 'interrupted', 'interjected', 'corrected',
  'repeated', 'clarified', 'explained', 'confessed', 'admitted',
  'acknowledged', 'agreed', 'promised', 'warned', 'threatened', 'cautioned',
  'urged', 'pleaded', 'begged', 'implored', 'demanded', 'ordered',
  'commanded', 'instructed', 'inquired', 'queried', 'questioned',
  'stammered', 'stuttered', 'drawled', 'told',
];

const EXTENDED_SPEECH_VERB_LIST = [
  ...STRICT_SPEECH_VERB_LIST,
  'sighed', 'panted', 'choked', 'sobbed', 'laughed', 'chuckled', 'giggled',
  'snickered', 'thundered', 'bellowed', 'boomed', 'echoed', 'chanted',
  'sang', 'hummed', 'maintained', 'countered', 'quipped', 'joked', 'teased',
  'taunted', 'mocked', 'scoffed', 'jeered', 'sneered', 'concluded',
  'finished', 'elaborated', 'conceded', 'vowed', 'swore', 'directed',
  'wondered', 'mused', 'pondered', 'breathed', 'purred', 'cooed', 'croaked',
  'wheezed', 'rasped', 'squeaked', 'chirped', 'chimed',
];

const STRICT_SPEECH_VERBS_PATTERN = STRICT_SPEECH_VERB_LIST.join('|');
const SPEECH_VERBS = EXTENDED_SPEECH_VERB_LIST.join('|');
const STRICT_SPEECH_VERB_SET = new Set(STRICT_SPEECH_VERB_LIST);

const NAME_PARTICLES = new Set([
  'of', 'de', 'la', 'le', 'du', 'van', 'von', 'da', 'del', 'di', 'al', 'mac', 'mc',
]);

// Words that can NEVER be part of a character proper name
const BANNED_ANY_WORD = new Set([
  'he', 'she', 'they', 'it', 'i', 'we', 'you', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'hers', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  'who', 'whom', 'whose', 'which', 'that', 'this', 'these', 'those',
  'what', 'where', 'when', 'why', 'how',
  'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody',
  'nobody', 'noone', 'nothing', 'something', 'anything', 'everything',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'would', 'could', 'should', 'will', 'shall', 'may', 'might', 'must', 'can',
  'here', 'there', 'then', 'now', 'soon', 'still', 'yet', 'already',
  'often', 'always', 'never', 'seldom', 'rarely', 'sometimes', 'usually', 'frequently',
  'suddenly', 'finally', 'eventually', 'presently', 'immediately', 'slowly', 'quickly',
  'chapter', 'section', 'page', 'book', 'volume', 'part', 'figure',
  'voice', 'dialogue', 'character', 'speaker', 'narrator', 'unresolved', 'unknown', 'illustration', 'illustrations', 'image',
  'hold', 'let', 'look', 'wait', 'listen', 'come', 'go', 'stop', 'pray',
  'indeed', 'yes', 'no', 'well', 'oh', 'ah', 'alas',
  'speaker_a', 'speaker_b', 'dialogue_speaker',
  'and', 'or', 'but', 'nor', 'so', 'for', 'if', 'unless', 'until', 'till', 'while', 'because', 'although', 'though',
]);

// Words rejected when standalone (allowed inside multi-word names like "Mr. Holmes" or "Man in Black" only if named)
const BANNED_STANDALONE_NAMES = new Set([
  ...BANNED_ANY_WORD,
  'man', 'woman', 'boy', 'girl', 'child', 'kid', 'person', 'people', 'stranger',
  'figure', 'shadow', 'one', 'other', 'another', 'both', 'each', 'either', 'neither', 'all',
  'first', 'second', 'third', 'last', 'next', 'former', 'latter',
  'sir', 'madam', 'maam', 'yes', 'no', 'oh', 'ah', 'well', 'alas', 'indeed',
  'mr', 'mrs', 'ms', 'miss', 'dr', 'st', 'prof', 'rev', 'sgt', 'capt',
  'col', 'lt', 'gen', 'maj', 'insp', 'supt', 'mme', 'mlle', 'fr', 'sr', 'jr',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess', 'doctor', 'professor', 'inspector',
  'father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'friend', 'gentleman', 'fellow',
  'the', 'a', 'an', 'dursleys',
]);

// Prepositions, conjunctions, adverbs, and participles that begin a trailing tail to strip
const TAIL_CUT_WORDS = new Set([
  'to', 'with', 'in', 'from', 'at', 'on', 'by', 'for', 'as', 'while', 'when',
  'where', 'before', 'after', 'until', 'till', 'since', 'because', 'though',
  'although', 'and', 'or', 'but', 'that', 'which', 'who', 'whom', 'whose',
  'into', 'onto', 'upon', 'over', 'under', 'through', 'across', 'beside',
  'behind', 'between', 'among', 'around', 'toward', 'towards', 'against',
  'without', 'within', 'during', 'near', 'above', 'below', 'like', 'than',
  'then', 'there', 'here', 'now', 'yet', 'still', 'again', 'also', 'even',
  'only', 'just', 'once', 'already', 'very', 'quite', 'rather', 'almost',
  'perhaps', 'indeed', 'however', 'moreover', 'meanwhile', 'slowly', 'quickly',
  'suddenly', 'presently', 'immediately', 'finally', 'eventually', 'too', 'alone',
  'together', 'softly', 'quietly', 'loudly', 'blandly', 'carelessly', 'gently',
  'coldly', 'sharply', 'dryly', 'drily', 'wearily', 'eagerly', 'calmly',
  'hurriedly', 'abruptly', 'gravely', 'solemnly', 'warmly', 'coolly', 'firmly',
  'brightly', 'sadly', 'happily', 'angrily', 'nervously', 'patiently', 'impatiently',
  'half', 'both', 'all', 'not',
]);

const LEADING_NOISE_WORDS = new Set([
  'as', 'when', 'while', 'then', 'and', 'but', 'or', 'so', 'for', 'if',
  'meanwhile', 'suddenly', 'finally', 'now', 'here', 'there', 'after',
  'before', 'since', 'though', 'although', 'yet', 'however', 'indeed',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'young', 'old',
  'little', 'poor', 'dear', 'good', 'tall', 'short', 'stout', 'thin',
]);

const HABITUAL_ADVERBS = /\b(?:often|always|never|seldom|rarely|sometimes|usually|frequently)\s*$/i;

function slugifySpeakerId(name) {
  return String(name || 'unresolved')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'unresolved';
}

function isHonorificOrInitial(token) {
  if (!token) return false;
  const clean = token.replace(/\.+$/, '');
  if (!clean) return false;
  if (HONORIFIC_SET.has(clean.toLowerCase())) return true;
  // Single uppercase initial like "A." or "J."
  return /^[A-Z]\.$/.test(token.trim());
}

/**
 * Strip trailing sentence boundaries from text unless preceded by an honorific or initial.
 * Used when slicing "after quote" clauses up to the first sentence break.
 */
function sliceFirstSentence(text) {
  if (!text) return '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '?' || ch === '!' || ch === '\n') {
      return text.slice(0, i);
    }
    if (ch === '.') {
      const next = text[i + 1];
      if (!next || /[\s"'”’\)\]]/.test(next)) {
        const before = text.slice(0, i + 1);
        const match = before.match(/([A-Za-z]+)\.$/);
        const wordBefore = match ? match[1] : '';
        if (HONORIFIC_SET.has(wordBefore.toLowerCase()) || /^[A-Z]$/.test(wordBefore)) {
          continue;
        }
        return text.slice(0, i);
      }
    }
  }
  return text;
}

/**
 * Slice "before quote" text starting after the last sentence terminator,
 * respecting honorifics and initials like "Mr.", "Dr.", "St.", "J.".
 */
function sliceLastSentence(text) {
  if (!text) return '';
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '?' || ch === '!' || ch === '\n') {
      return text.slice(i + 1);
    }
    if (ch === '.') {
      const next = text[i + 1];
      if (next && /[\s"'“‘\(\[]/.test(next)) {
        const before = text.slice(0, i + 1);
        const match = before.match(/([A-Za-z]+)\.$/);
        const wordBefore = match ? match[1] : '';
        if (HONORIFIC_SET.has(wordBefore.toLowerCase()) || /^[A-Z]$/.test(wordBefore)) {
          continue;
        }
        return text.slice(i + 1);
      }
    }
  }
  return text;
}

/**
 * Normalize and validate a candidate speaker name.
 * Strips trailing prepositional/adverbial phrases ("to me", "with a smile", "in a low voice",
 * "from his armchair", "-ly" adverbs) and rejects pronouns/generic labels/standalone honorifics.
 */
function cleanSpeakerName(rawName) {
  if (!rawName || typeof rawName !== 'string') return null;

  let s = rawName.trim();
  // Strip outer quotation marks or bracket noise
  s = s.replace(/^[\s"'“”‘’`,;:\-—–\(\[]+/, '').trim();
  if (!s) return null;

  // Truncate at clause-breaking punctuation (comma, semicolon, colon, parens, dashes)
  const punctCut = s.search(/[,;:\(\[\u2014\u2013]|(?:\s--\s)/);
  if (punctCut !== -1) {
    s = s.slice(0, punctCut).trim();
  }
  if (!s) return null;

  // Truncate at first real sentence period (preserving honorifics & single initials)
  s = sliceFirstSentence(s).trim();
  if (!s) return null;

  // Split into whitespace-separated tokens and strip leading lowercase noise articles/connectors
  let tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length > 0) {
    const bare = tokens[0].replace(/^['"“‘]+|[.,!?;:'"”’]+$/g, '').toLowerCase();
    if (!bare || LEADING_NOISE_WORDS.has(bare)) {
      tokens.shift();
    } else {
      break;
    }
  }
  if (tokens.length === 0) return null;

  // Walk tokens forward and cut at prepositional, adverbial, participial, or lowercase verb tails
  const kept = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const bare = tok.replace(/[.,!?;:'"”’]+$/g, '');
    const lower = bare.toLowerCase();

    if (!bare) break;

    // Cut immediately at "of the/his/her/my/our/their/a/an" unless it's "King of Bohemia" style
    if (lower === 'of') {
      const nextTok = tokens[i + 1];
      const nextBare = nextTok ? nextTok.replace(/[.,!?;:'"”’]+$/g, '') : '';
      if (kept.length > 0 && nextBare && /^[A-Z]/.test(nextBare)) {
        kept.push('of');
        continue;
      }
      break;
    }

    if (TAIL_CUT_WORDS.has(lower)) {
      break;
    }

    // Strip lowercase -ly adverbs or -ing participles or generic lowercase non-name tokens
    if (/^[a-z]/.test(bare)) {
      if (NAME_PARTICLES.has(lower) && kept.length > 0 && i < tokens.length - 1) {
        const nextTok = tokens[i + 1]?.replace(/[.,!?;:'"”’]+$/g, '') || '';
        if (/^[A-Z]/.test(nextTok)) {
          kept.push(bare);
          continue;
        }
      }
      break;
    }

    kept.push(tok);
    if (kept.length >= 5) break;
  }

  // Strip trailing particles (e.g., if truncated right before lowercase word)
  while (kept.length > 0 && NAME_PARTICLES.has(kept[kept.length - 1].toLowerCase())) {
    kept.pop();
  }

  if (kept.length === 0 || kept.length > 5) return null;

  // Clean trailing punctuation on tokens (preserving honorific & initial periods)
  const cleanedTokens = kept.map((tok, idx) => {
    const trimmed = tok.replace(/[,;:\?!'"]+$/g, '');
    if (trimmed.endsWith('.')) {
      const stem = trimmed.slice(0, -1);
      if (HONORIFIC_SET.has(stem.toLowerCase()) || (/^[A-Z]$/.test(stem) && idx < kept.length - 1)) {
        return `${stem}.`;
      }
      return stem;
    }
    return trimmed;
  }).filter(Boolean);

  if (cleanedTokens.length === 0) return null;

  // Reject if any token is in BANNED_ANY_WORD
  for (const tok of cleanedTokens) {
    const bare = tok.replace(/\.+$/, '').toLowerCase();
    if (!bare || BANNED_ANY_WORD.has(bare)) {
      return null;
    }
    // Check hyphenated parts are valid letters/capitalized segments
    if (!/^[A-Za-z][A-Za-z'.\-]*\.?$/.test(tok)) {
      return null;
    }
  }

  // Must contain at least one non-honorific name token (rejects bare "Mr.", "Dr.", "Mr. Dr.")
  const hasRealNameToken = cleanedTokens.some((tok) => {
    const bare = tok.replace(/\.+$/, '').toLowerCase();
    return !HONORIFIC_SET.has(bare) && !NAME_PARTICLES.has(bare) && bare.length >= 2;
  });
  if (!hasRealNameToken) return null;

  // Standalone single-token check
  if (cleanedTokens.length === 1) {
    const bare = cleanedTokens[0].replace(/\.+$/, '').toLowerCase();
    if (BANNED_STANDALONE_NAMES.has(bare) || bare.length < 2) {
      return null;
    }
  }

  // Every non-particle word must begin with an uppercase letter
  for (let i = 0; i < cleanedTokens.length; i++) {
    const tok = cleanedTokens[i];
    const bare = tok.replace(/\.+$/, '').toLowerCase();
    if (NAME_PARTICLES.has(bare)) continue;
    if (!/^[A-Z]/.test(tok)) return null;
  }

  return cleanedTokens.join(' ');
}

function classifyPronounToken(raw) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^[,;:\s"']+|[.,;:\?!\s"']+$/g, '');
  if (!trimmed) return null;
  if (trimmed === 'I' || trimmed.toLowerCase() === 'i') {
    return { kind: 'pronoun', pronounType: 'first_person' };
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'he') return { kind: 'pronoun', pronounType: 'male' };
  if (lower === 'she') return { kind: 'pronoun', pronounType: 'female' };
  if (['we', 'they', 'you', 'it', 'one'].includes(lower)) {
    return { kind: 'pronoun', pronounType: 'ambiguous' };
  }
  return null;
}

function resolveCandidateFromSubjectText(rawSubject) {
  if (!rawSubject) return null;
  const trimmed = rawSubject.trim().replace(/^[,;:\-—–\s]+|[,;:\-—–\s]+$/g, '');
  if (!trimmed) return null;

  const pronoun = classifyPronounToken(trimmed);
  if (pronoun) {
    return pronoun.pronounType === 'ambiguous' ? null : pronoun;
  }

  // Check if subject ends after an initial clause separator like "When X entered, he" or "Holmes chuckled and"
  // 1) Try splitting trailing conjunctions ("and", "then") so "Mr. Sherlock Holmes walked over and" -> "Mr. Sherlock Holmes"
  const subParts = trimmed.split(/\s*,\s*/);
  for (let idx = subParts.length - 1; idx >= 0; idx--) {
    let clause = subParts[idx].trim();
    if (!clause) continue;

    // Strip leading sentence conjunctions
    clause = clause.replace(/^(?:and|then|but|so|while|as|when)\s+/i, '').trim();
    const clausePronoun = classifyPronounToken(clause);
    if (clausePronoun) {
      return clausePronoun.pronounType === 'ambiguous' ? null : clausePronoun;
    }

    // Handle "he walked over and" / "I turned and" / "Holmes smiled and"
    const firstWordMatch = clause.match(/^(I|he|she)\b/i);
    if (firstWordMatch && /\s+(?:[a-z]+ed|[a-z]+ing|turned|rose|stood|sat|stepped|looked|glanced|nodded|smiled|shook|gave|took|came|went|said|asked)\b/i.test(clause)) {
      const firstPron = classifyPronounToken(firstWordMatch[1]);
      if (firstPron && firstPron.pronounType !== 'ambiguous') {
        return firstPron;
      }
    }

    const cleaned = cleanSpeakerName(clause);
    if (cleaned) {
      return { kind: 'name', name: cleaned };
    }
  }

  return null;
}

/**
 * Extract speaker tag or pronoun from text immediately AFTER a closing quote.
 */
function extractTagAfter(afterText, quoteEndingChar, sensitivity = 'balanced') {
  if (!afterText || !afterText.trim()) return null;

  const verbPattern = sensitivity === 'strict' ? STRICT_SPEECH_VERBS_PATTERN : SPEECH_VERBS;
  const firstClause = sliceFirstSentence(afterText).trim();
  if (!firstClause) return null;

  // Strip leading punctuation outside quote (", said Holmes." or ". He said.")
  const leadStripped = firstClause.replace(/^[,;.\-—–\s]+/, '').trim();
  if (!leadStripped) return null;

  // In strict mode, if quote ended with '.', '!', '?' and next text starts capitalized with non-inverted structure, require strong verb
  const endsWithTerminal = quoteEndingChar === '.' || quoteEndingChar === '!' || quoteEndingChar === '?';

  // Pattern A (Inverted): <SPEECH_VERB> <SUBJECT> (e.g. "said Mr. Sherlock Holmes", "cried I", "remarked he")
  const invertedRegex = new RegExp(`^(?:${verbPattern})\\b\\s+(.+)$`, 'i');
  const invMatch = leadStripped.match(invertedRegex);
  if (invMatch) {
    const rest = invMatch[1].trim();
    // Extract pronoun before stripping prepositional tails ("said he with a smile", "cried I in amazement")
    const firstTokMatch = rest.match(/^(I|he|she|we|they|you)\b(?:\s*[,.!?;:\-—–]|\s+(?:to|with|in|from|at|as|while|quietly|softly|slowly|quickly|[a-z]+ly)\b|$)/i);
    if (firstTokMatch) {
      const pron = classifyPronounToken(firstTokMatch[1]);
      if (pron && pron.pronounType !== 'ambiguous') return pron;
      if (pron && pron.pronounType === 'ambiguous') return null;
    }

    const cleaned = cleanSpeakerName(rest);
    if (cleaned) return { kind: 'name', name: cleaned };
  }

  // Pattern B (Subject-Verb): <SUBJECT> [adv] <SPEECH_VERB> (e.g. "Mr. Sherlock Holmes said", "I asked", "he remarked")
  const subjectVerbRegex = new RegExp(
    `^(.+?)\\s+(?:[a-z]+ly\\s+){0,2}\\b(${verbPattern})\\b(?:\\s|$|[,;:\\-—–.])`,
    'i'
  );
  const svMatch = leadStripped.match(subjectVerbRegex);
  if (svMatch) {
    const subjectPart = svMatch[1].trim();
    const verbWord = svMatch[2].toLowerCase();

    // Avoid "Wait." Holmes smiled and walked away. in strict mode
    if (sensitivity === 'strict' && endsWithTerminal && !STRICT_SPEECH_VERB_SET.has(verbWord)) {
      return null;
    }
    if (HABITUAL_ADVERBS.test(subjectPart)) return null;
    if (/\b(?:that|which|who|whom)\s*$/i.test(subjectPart)) return null;

    // Limit subject length to avoid matching long unrelated narration
    if (subjectPart.length <= 55) {
      const resolved = resolveCandidateFromSubjectText(subjectPart);
      if (resolved) return resolved;
    }
  }

  return null;
}

/**
 * Extract speaker tag or pronoun from text immediately BEFORE an opening quote.
 */
function extractTagBefore(beforeText, sensitivity = 'balanced') {
  if (!beforeText || !beforeText.trim()) return null;

  const verbPattern = sensitivity === 'strict' ? STRICT_SPEECH_VERBS_PATTERN : SPEECH_VERBS;
  const lastClause = sliceLastSentence(beforeText).trim();
  if (!lastClause) return null;

  // Colon script format: "Sherlock Holmes:" or "HOLMES:"
  const colonMatch = lastClause.match(/^([A-Z][^:]{0,45}):\s*$/);
  if (colonMatch && sensitivity !== 'strict') {
    const cleaned = cleanSpeakerName(colonMatch[1]);
    if (cleaned) return { kind: 'name', name: cleaned };
  }

  // Interrupted inverted tag right before quote: ", said Holmes," or "— cried Watson, wiping his brow —"
  const interruptedInvRegex = new RegExp(
    `(?:^|[,;\\u2014\\u2013\\-]\\s*)\\b(${verbPattern})\\b\\s+([^,;:\\u2014\\u2013\\n]{1,45})(?:\\s*,[^"\\n]{0,40})?\\s*[,:\\u2014\\u2013\\-]?\\s*$`,
    'i'
  );
  const intMatch = lastClause.match(interruptedInvRegex);
  if (intMatch) {
    const rest = intMatch[2].trim();
    const pronMatch = rest.match(/^(I|he|she|we|they|you)\b/i);
    if (pronMatch) {
      const pron = classifyPronounToken(pronMatch[1]);
      if (pron && pron.pronounType !== 'ambiguous') return pron;
      if (pron && pron.pronounType === 'ambiguous') return null;
    }
    const cleaned = cleanSpeakerName(rest);
    if (cleaned) return { kind: 'name', name: cleaned };
  }

  // Standard <Subject> [adv/prep] <SpeechVerb> [optional object/tail] [,:-]? $
  const beforeRegex = new RegExp(
    `^(.{1,80}?)\\s+(?:[a-z]+ly\\s+){0,2}\\b(${verbPattern})\\b(?:\\s+(?:(?:to|at|for|in|with|from)\\s+[\\w.\\-]+(?:\\s+[\\w.\\-]+){0,3}|her|him|me|them|us|you|[a-z]+ly|[A-Z][\\w.-]+)){0,4}\\s*[,:\\u2014\\u2013\\-]?\\s*$`,
    'i'
  );
  const bMatch = lastClause.match(beforeRegex);
  if (bMatch) {
    const subjectPart = bMatch[1].trim();
    const verbWord = bMatch[2].toLowerCase();

    if (sensitivity === 'strict' && !STRICT_SPEECH_VERB_SET.has(verbWord)) {
      return null;
    }
    if (HABITUAL_ADVERBS.test(subjectPart)) return null;
    if (/\b(?:that|which|who|whom)\s*$/i.test(subjectPart)) return null;

    // Strip internal parentheticals like "Mr. Sherlock Holmes, with a smile," -> "Mr. Sherlock Holmes"
    const strippedParen = subjectPart.replace(/,\s*(?:[a-z]|with|in|from|after|before)[^,]{1,45},?\s*$/i, '').trim();
    const resolved = resolveCandidateFromSubjectText(strippedParen || subjectPart);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Extract single-subject pre-quote action beat in balanced/aggressive modes.
 * e.g. "Holmes lit his pipe. \"Take a look at this.\"" or "Watson stared. \"Really?\""
 */
function extractActionBeat(beforeText, afterText, sensitivity) {
  if (sensitivity === 'strict') return null;

  if (beforeText && beforeText.trim()) {
    const sentence = sliceLastSentence(beforeText).trim();
    // Look for "<ProperName> <lowercase-verb>..." at start of last sentence
    const m = sentence.match(/^((?:(?:Mr|Mrs|Ms|Dr|St|Prof|Rev|Sgt|Capt|Col|Lt|Gen|Maj|Insp|Supt)\.\s+)*(?:[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2}))\s+(?:[a-z]{2,})/);
    if (m) {
      const cleaned = cleanSpeakerName(m[1]);
      if (cleaned) return { kind: 'name', name: cleaned };
    }
    const pronM = sentence.match(/^(I|He|She)\s+[a-z]{2,}/);
    if (pronM) {
      const pron = classifyPronounToken(pronM[1]);
      if (pron && pron.pronounType !== 'ambiguous') return pron;
    }
  }

  if (sensitivity === 'aggressive' && afterText && afterText.trim()) {
    const sentence = sliceFirstSentence(afterText).replace(/^[,;.\-—–\s]+/, '').trim();
    const m = sentence.match(/^((?:(?:Mr|Mrs|Ms|Dr|St|Prof|Rev|Sgt|Capt|Col|Lt|Gen|Maj|Insp|Supt)\.\s+)*(?:[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2}))\s+(?:[a-z]{2,})/);
    if (m) {
      const cleaned = cleanSpeakerName(m[1]);
      if (cleaned) return { kind: 'name', name: cleaned };
    }
  }

  return null;
}

/**
 * Determine effective quote mode for the chapter.
 */
function resolveEffectiveQuoteStyle(rawText, quoteStyle = 'auto') {
  if (quoteStyle === 'double' || quoteStyle === 'single') {
    return quoteStyle;
  }
  // Auto-detect whether chapter uses British single-quoted dialogue
  const doubleCount = (rawText.match(/["\u201c][^"\u201d\n]{2,}["\u201d]/g) || []).length;
  const curlySingleCount = (rawText.match(/\u2018(?:[^\u2018\u2019\n]|(?<=[a-zA-Z])\u2019(?=[a-zA-Z])){2,}\u2019/g) || []).length;
  const asciiSingleCount = (rawText.match(/(?:^|[\s(\[—–:,])'[^'\n]{4,}'(?=$|[\s.,!?;:\])—–\-])/gm) || []).length;

  if (doubleCount < 2 && (curlySingleCount > 0 || asciiSingleCount > 0)) {
    return 'single';
  }
  return 'double_and_curly_single';
}

/**
 * Tokenize a paragraph into ordered narration/quote spans without splitting contractions or possessives.
 */
function extractQuotesFromParagraph(para, effectiveQuoteStyle, continueOpenDouble = false, allowUnclosedOpening = false) {
  const quotes = [];

  if (continueOpenDouble) {
    // Classic multi-paragraph quote: continuation paragraph typically starts with '"' / '“'
    const trimmed = para.trimStart();
    const leadingOffset = para.length - trimmed.length;
    const startsWithDouble = trimmed.startsWith('"') || trimmed.startsWith('\u201c');
    const searchStart = startsWithDouble ? leadingOffset + 1 : 0;

    // Look for closing quote in this paragraph
    let closeIdx = -1;
    for (let i = searchStart; i < para.length; i++) {
      if (para[i] === '"' || para[i] === '\u201d') {
        closeIdx = i;
        break;
      }
    }

    if (closeIdx === -1) {
      // Whole paragraph continues open quote and remains unclosed
      const inner = para.slice(searchStart).trim();
      if (inner.length > 0) {
        quotes.push({
          start: leadingOffset,
          end: para.length,
          text: inner,
          endingChar: inner[inner.length - 1] || '',
          continuedFromPrev: true,
          unclosedAtEnd: true,
        });
      }
      return quotes;
    }

    // Closes within this paragraph; after closeIdx, scan normally for further quotes
    const firstInner = para.slice(searchStart, closeIdx).trim();
    if (firstInner.length > 0) {
      quotes.push({
        start: leadingOffset,
        end: closeIdx + 1,
        text: firstInner,
        endingChar: firstInner[firstInner.length - 1] || '',
        continuedFromPrev: true,
        unclosedAtEnd: false,
      });
    }
    const restQuotes = scanPairedQuotes(para, closeIdx + 1, effectiveQuoteStyle, allowUnclosedOpening);
    return quotes.concat(restQuotes);
  }

  return scanPairedQuotes(para, 0, effectiveQuoteStyle, allowUnclosedOpening);
}

function isLetter(ch) {
  return Boolean(ch && /[a-zA-Z]/.test(ch));
}

function scanPairedQuotes(para, startIndex, effectiveQuoteStyle, allowUnclosedOpening) {
  const quotes = [];
  const allowDouble = effectiveQuoteStyle !== 'single';
  const allowCurlySingle = effectiveQuoteStyle === 'single' || effectiveQuoteStyle === 'double_and_curly_single';
  const allowAsciiSingle = effectiveQuoteStyle === 'single';

  let i = startIndex;
  while (i < para.length) {
    const ch = para[i];

    // 1. Double quotes ("..." or “...”)
    if (allowDouble && (ch === '"' || ch === '\u201c')) {
      const openIdx = i;
      let closeIdx = -1;
      for (let j = i + 1; j < para.length; j++) {
        if (para[j] === '"' || para[j] === '\u201d') {
          closeIdx = j;
          break;
        }
      }
      if (closeIdx !== -1) {
        const inner = para.slice(openIdx + 1, closeIdx);
        if (inner.trim().length > 0) {
          quotes.push({
            start: openIdx,
            end: closeIdx + 1,
            text: inner,
            endingChar: inner.trim().slice(-1),
            continuedFromPrev: false,
            unclosedAtEnd: false,
          });
        }
        i = closeIdx + 1;
        continue;
      } else if (allowUnclosedOpening) {
        // Multi-paragraph open quote ending at paragraph end
        const inner = para.slice(openIdx + 1).trim();
        if (inner.length >= 4) {
          quotes.push({
            start: openIdx,
            end: para.length,
            text: inner,
            endingChar: inner.slice(-1),
            continuedFromPrev: false,
            unclosedAtEnd: true,
          });
          break;
        }
      }
    }

    // 2. Curly single quotes (‘...’)
    if (allowCurlySingle && ch === '\u2018') {
      const prev = i > 0 ? para[i - 1] : '';
      const next = para[i + 1] || '';
      // Avoid apostrophe-like usage inside words
      if (!isLetter(prev) && next) {
        const openIdx = i;
        let closeIdx = -1;
        for (let j = i + 1; j < para.length; j++) {
          if (para[j] === '\u2019') {
            const p = para[j - 1];
            const n = para[j + 1];
            // Skip apostrophe inside contractions/possessives like Holmes’s or don’t
            if (isLetter(p) && isLetter(n)) continue;
            closeIdx = j;
            break;
          }
        }
        if (closeIdx !== -1) {
          const inner = para.slice(openIdx + 1, closeIdx);
          if (inner.trim().length >= 2) {
            quotes.push({
              start: openIdx,
              end: closeIdx + 1,
              text: inner,
              endingChar: inner.trim().slice(-1),
              continuedFromPrev: false,
              unclosedAtEnd: false,
            });
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    // 3. ASCII single quotes ('...') when in single-quote mode
    if (allowAsciiSingle && ch === '\'') {
      const prev = i > 0 ? para[i - 1] : '';
      const next = para[i + 1] || '';
      const validOpeningBoundary = i === 0 || /[\s(\[—–\-:,]/.test(prev);
      if (validOpeningBoundary && next && !/\s/.test(next)) {
        const openIdx = i;
        let closeIdx = -1;
        for (let j = i + 1; j < para.length; j++) {
          if (para[j] === '\'') {
            const p = para[j - 1];
            const n = para[j + 1];
            if (isLetter(p) && isLetter(n)) continue;
            if (!n || /[\s.,!?;:\])—–\-]/.test(n)) {
              closeIdx = j;
              break;
            }
          }
        }
        if (closeIdx !== -1) {
          const inner = para.slice(openIdx + 1, closeIdx);
          if (inner.trim().length >= 2) {
            quotes.push({
              start: openIdx,
              end: closeIdx + 1,
              text: inner,
              endingChar: inner.trim().slice(-1),
              continuedFromPrev: false,
              unclosedAtEnd: false,
            });
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    i++;
  }

  return quotes;
}

/**
 * Infer speaker gender from honorifics or first/surname dictionaries.
 */
function inferSpeakerGender(name) {
  if (!name) return 'unknown';
  const tokens = name
    .toLowerCase()
    .split(/[\s\-]+/)
    .map((t) => t.replace(/\.+$/, ''))
    .filter(Boolean);

  for (const tok of tokens) {
    if (MALE_TITLES.has(tok)) return 'male';
    if (FEMALE_TITLES.has(tok)) return 'female';
  }
  for (const tok of tokens) {
    if (MALE_NAMES.has(tok)) return 'male';
    if (FEMALE_NAMES.has(tok)) return 'female';
  }
  return 'unknown';
}

/**
 * Check whether two speaker labels refer to the same character (handles "Mr. Sherlock Holmes" vs "Holmes").
 */
function isSameSpeaker(a, b) {
  if (!a || !b) return false;
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (normA === normB) return true;

  const stripTitles = (s) =>
    s
      .split(/\s+/)
      .map((w) => w.replace(/\.+$/, ''))
      .filter((w) => w && !TITLE_PREFIX_WORDS.has(w))
      .join(' ');

  const strippedA = stripTitles(normA);
  const strippedB = stripTitles(normB);

  // Prevent Mr. Dursley matching Mrs. Dursley when honorifics conflict
  const genderA = inferSpeakerGender(a);
  const genderB = inferSpeakerGender(b);
  if (genderA !== 'unknown' && genderB !== 'unknown' && genderA !== genderB) {
    return false;
  }

  if (strippedA && strippedB && strippedA === strippedB) return true;

  // Bare surname vs full name when there is no conflicting gender
  const wordsA = strippedA.split(/\s+/).filter(Boolean);
  const wordsB = strippedB.split(/\s+/).filter(Boolean);
  if (wordsA.length === 1 && wordsB.length >= 2 && wordsA[0] === wordsB[wordsB.length - 1]) {
    return true;
  }
  if (wordsB.length === 1 && wordsA.length >= 2 && wordsB[0] === wordsA[wordsA.length - 1]) {
    return true;
  }

  return false;
}

function updateRecentSpeakers(recentSpeakers, speaker) {
  if (!speaker || speaker === 'Unresolved' || speaker === 'narrator') return recentSpeakers;
  const idx = recentSpeakers.findIndex((s) => isSameSpeaker(s, speaker));
  if (idx !== -1) {
    // Move to most recent slot without changing canonical ordering if same person
    const filtered = recentSpeakers.filter((_, i) => i !== idx);
    filtered.push(speaker);
    return filtered.slice(-2);
  }
  const updated = recentSpeakers.concat([speaker]);
  return updated.slice(-2);
}

/**
 * Scan rawText to build safe surname -> fullName canonicalization table
 * (only maps bare "Holmes" -> "Mr. Sherlock Holmes" when unambiguous across the chapter).
 */
function buildChapterSurnameMap(rawText, pass1Paragraphs) {
  const fullNamesByLastWord = new Map();

  const registerFullName = (fullName) => {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return;
    const lastBare = parts[parts.length - 1].replace(/\.+$/, '').toLowerCase();
    if (!lastBare || lastBare.length < 2) return;
    if (!fullNamesByLastWord.has(lastBare)) fullNamesByLastWord.set(lastBare, new Set());
    fullNamesByLastWord.get(lastBare).add(fullName);
  };

  for (const para of pass1Paragraphs) {
    if (!para || para.type !== 'prose') continue;
    for (const q of para.quotes) {
      if (q.explicitTag?.kind === 'name') registerFullName(q.explicitTag.name);
      if (q.actionBeat?.kind === 'name') registerFullName(q.actionBeat.name);
    }
  }

  // Also scan prose for multi-word titled names like "Mrs. Dursley" or "Mycroft Holmes"
  // so bare "Dursley" or "Holmes" isn't wrongly collapsed when multiple bearers exist
  const titleNameMatches = rawText.match(/\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|St\.|Miss|Sir|Lord|Lady|Prof\.|Inspector|[A-Z][a-z]{2,})\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
  for (const cand of titleNameMatches) {
    const cleaned = cleanSpeakerName(cand);
    if (cleaned && cleaned.includes(' ')) {
      registerFullName(cleaned);
    }
  }

  const canonicalSurnameMap = new Map();
  for (const [surname, variants] of fullNamesByLastWord.entries()) {
    // Allow merge if there is only one distinct character sharing that surname (or "Sherlock Holmes" vs "Mr. Sherlock Holmes")
    const arr = Array.from(variants);
    const allSamePerson = arr.every((v) => isSameSpeaker(v, arr[0]));
    if (allSamePerson) {
      // Pick longest variant (e.g. "Mr. Sherlock Holmes" over "Sherlock Holmes")
      arr.sort((a, b) => b.length - a.length);
      canonicalSurnameMap.set(surname, arr[0]);
    }
  }

  return canonicalSurnameMap;
}

/**
 * Determine identity of first-person narrator-participant ("I") in the chapter.
 */
function detectFirstPersonIdentity(rawText) {
  if (/\b(?:sherlock\s+holmes|mr\.\s*holmes|dr\.\s*watson|baker\s+street|lestrade|moriarty|mycroft|mrs\.\s*hudson|holmes)\b/i.test(rawText)) {
    return 'Dr. Watson';
  }
  return 'Protagonist';
}

/**
 * Parse raw chapter text into narration, dialogue, and image segments.
 *
 * @param {string} rawText
 * @param {string} [title='Untitled Chapter']
 * @param {string} [chapterId='ch-1']
 * @param {object} [options={}]
 * @param {'balanced'|'aggressive'|'strict'} [options.sensitivity='balanced']
 * @param {boolean} [options.turnTaking=true]
 * @param {'auto'|'double'|'single'} [options.quoteStyle='auto']
 */
function parseChapter(rawText, title = 'Untitled Chapter', chapterId = 'ch-1', options = {}) {
  const sensitivity = ['strict', 'balanced', 'aggressive'].includes(options.sensitivity)
    ? options.sensitivity
    : 'balanced';
  const turnTaking = options.turnTaking !== false;
  const quoteStyle = ['auto', 'double', 'single'].includes(options.quoteStyle)
    ? options.quoteStyle
    : 'auto';

  const normalizedText = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const effectiveQuoteStyle = resolveEffectiveQuoteStyle(normalizedText, quoteStyle);
  const firstPersonIdentity = detectFirstPersonIdentity(normalizedText);

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Check if the chapter actually uses Gutenberg-style unclosed multi-paragraph opening quotes
  const hasMultiParaContinuation = paragraphs.some((p) => {
    const trimmed = p.trimStart();
    if (!trimmed.startsWith('"') && !trimmed.startsWith('\u201c')) return false;
    const count = (trimmed.match(/["\u201c\u201d]/g) || []).length;
    return count === 1;
  });

  // Pass 1: Extract quote spans and local explicit tags/action beats per paragraph
  const pass1Paragraphs = [];
  let unclosedActive = false;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];

    // Handle standalone Markdown image blocks
    const imgMatch = para.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      pass1Paragraphs.push({
        type: 'image',
        altText: imgMatch[1] || 'Illustration',
        imageUrl: imgMatch[2],
      });
      unclosedActive = false;
      continue;
    }

    const allowUnclosedNext = hasMultiParaContinuation && pIdx < paragraphs.length - 1;
    const quotes = extractQuotesFromParagraph(
      para,
      effectiveQuoteStyle,
      unclosedActive,
      allowUnclosedNext
    );

    unclosedActive = quotes.length > 0 && Boolean(quotes[quotes.length - 1].unclosedAtEnd);

    const enrichedQuotes = quotes.map((q, qIdx) => {
      const prevEnd = qIdx === 0 ? 0 : quotes[qIdx - 1].end;
      const nextStart = qIdx + 1 < quotes.length ? quotes[qIdx + 1].start : para.length;
      const beforeChunk = para.slice(prevEnd, q.start);
      const afterChunk = para.slice(q.end, nextStart);

      const tagAfter = extractTagAfter(afterChunk, q.endingChar, sensitivity);
      const tagBefore = extractTagBefore(beforeChunk, sensitivity);

      // Prefer tagAfter when interrupting mid-sentence tag sits between two quotes ("...", said Holmes, "...")
      let explicitTag = null;
      let explicitSource = null;

      // Check whether beforeChunk is literally the interrupted tag that already attributed quote qIdx - 1
      let interruptedFromPrev = false;
      if (qIdx > 0 && !/[.!?]\s*$/.test(beforeChunk.trim())) {
        // Intervening text between quotes in the same paragraph has no terminal sentence break
        interruptedFromPrev = true;
      }

      if (tagAfter && tagAfter.kind === 'name') {
        explicitTag = tagAfter;
        explicitSource = 'after';
      } else if (tagBefore && tagBefore.kind === 'name') {
        explicitTag = tagBefore;
        explicitSource = 'before';
      } else if (tagAfter) {
        explicitTag = tagAfter;
        explicitSource = 'after';
      } else if (tagBefore) {
        explicitTag = tagBefore;
        explicitSource = 'before';
      }

      const actionBeat = !explicitTag
        ? extractActionBeat(beforeChunk, afterChunk, sensitivity)
        : null;

      return {
        ...q,
        beforeChunk,
        afterChunk,
        explicitTag,
        explicitSource,
        interruptedFromPrev,
        actionBeat,
      };
    });

    pass1Paragraphs.push({
      type: 'prose',
      text: para,
      quotes: enrichedQuotes,
    });
  }

  const canonicalSurnameMap = buildChapterSurnameMap(normalizedText, pass1Paragraphs);

  const canonicalize = (name) => {
    if (!name) return name;
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      const bare = words[0].replace(/\.+$/, '').toLowerCase();
      if (canonicalSurnameMap.has(bare)) {
        return canonicalSurnameMap.get(bare);
      }
    }
    return name;
  };

  // Helper to peek up to 2 paragraphs ahead for delayed speech tags or pronoun resolution
  const peekAheadExplicit = (fromPIdx, filterGender = null) => {
    const discovered = [];
    let dialogueTurnsChecked = 0;
    for (let lookP = fromPIdx + 1; lookP < pass1Paragraphs.length && lookP <= fromPIdx + 3; lookP++) {
      const pNode = pass1Paragraphs[lookP];
      if (!pNode || pNode.type !== 'prose' || pNode.quotes.length === 0) continue;
      dialogueTurnsChecked++;
      if (dialogueTurnsChecked > 2 && discovered.length > 0) break;

      const q0 = pNode.quotes[0];
      let resolvedName = null;
      if (q0.explicitTag?.kind === 'name') {
        resolvedName = canonicalize(q0.explicitTag.name);
      } else if (q0.explicitTag?.kind === 'pronoun' && q0.explicitTag.pronounType === 'first_person') {
        resolvedName = firstPersonIdentity;
      } else if (q0.actionBeat?.kind === 'name') {
        resolvedName = canonicalize(q0.actionBeat.name);
      }

      if (resolvedName) {
        const g = resolvedName === 'Dr. Watson' ? 'male' : inferSpeakerGender(resolvedName);
        if (!filterGender || g === filterGender) {
          discovered.push({
            turnOffset: dialogueTurnsChecked,
            paragraphOffset: lookP - fromPIdx,
            name: resolvedName,
            gender: g,
          });
        }
      }
      if (lookP - fromPIdx >= 2 && discovered.length >= 2) break;
    }
    return discovered;
  };

  // Pass 2: Chapter-level conversational state machine emitting ordered segments
  const segments = [];
  let segCounter = 1;

  let firstPersonSpeaker = null;
  let lastMaleSpeaker = null;
  let lastFemaleSpeaker = null;
  let lastDialogueSpeaker = null;
  let unclosedContinuationSpeaker = null;
  let recentSpeakers = [];
  const knownGenders = new Map();

  const recordSpeakerState = (speakerName, isFirstPersonPronoun = false) => {
    if (!speakerName || speakerName === 'Unresolved' || speakerName === 'narrator') return;

    let gender = knownGenders.get(speakerName) || inferSpeakerGender(speakerName);
    if (speakerName === 'Dr. Watson') gender = 'male';
    if (gender !== 'unknown') knownGenders.set(speakerName, gender);

    if (isFirstPersonPronoun) {
      firstPersonSpeaker = speakerName;
      // Do NOT clobber lastMaleSpeaker if a third-person male (e.g. Holmes) is active,
      // because Watson ("I") never refers to himself as "he".
      if (!lastMaleSpeaker && gender === 'male' && speakerName !== 'Dr. Watson') {
        lastMaleSpeaker = speakerName;
      }
    } else {
      if (gender === 'male') lastMaleSpeaker = speakerName;
      if (gender === 'female') lastFemaleSpeaker = speakerName;
    }

    lastDialogueSpeaker = speakerName;
    recentSpeakers = updateRecentSpeakers(recentSpeakers, speakerName);
  };

  const makeNarrationSeg = (text) => ({
    segment_id: `seg-${segCounter++}`,
    type: 'narration',
    speaker_name: 'narrator',
    speaker_id: 'narrator',
    speaker_gender: 'male',
    assigned_voice_id: 'en-GB-RyanNeural',
    text,
    attribution_confidence: 1.0,
    attribution_source: 'narrator_default',
  });

  for (let pIdx = 0; pIdx < pass1Paragraphs.length; pIdx++) {
    const pNode = pass1Paragraphs[pIdx];

    if (pNode.type === 'image') {
      segments.push({
        segment_id: `seg-${segCounter++}`,
        type: 'image',
        speaker_name: 'Illustration',
        speaker_id: 'image',
        speaker_gender: 'unknown',
        assigned_voice_id: 'image',
        text: pNode.altText,
        image_url: pNode.imageUrl,
        attribution_confidence: 1.0,
        attribution_source: 'image',
      });
      unclosedContinuationSpeaker = null;
      continue;
    }

    const para = pNode.text;
    const quotes = pNode.quotes;

    if (quotes.length === 0) {
      segments.push(makeNarrationSeg(para));
      unclosedContinuationSpeaker = null;
      continue;
    }

    let cursor = 0;
    let paragraphFirstSpeaker = null;

    for (let qIdx = 0; qIdx < quotes.length; qIdx++) {
      const q = quotes[qIdx];

      // Emit narration before this quote
      if (q.start > cursor) {
        const narrBefore = para.slice(cursor, q.start).trim();
        if (narrBefore.length > 0) {
          segments.push(makeNarrationSeg(narrBefore));
        }
      }

      let speakerName = null;
      let attributionSource = 'unresolved';
      let confidence = 0.35;
      let resolvedViaFirstPerson = false;

      // 1. Continuation of multi-paragraph unclosed quote
      if (q.continuedFromPrev && unclosedContinuationSpeaker && !q.explicitTag) {
        speakerName = unclosedContinuationSpeaker;
        attributionSource = 'context_continuation';
        confidence = 0.88;
      }
      // 2. Same-paragraph interrupted/follow-up quote ("...", said Holmes, "...")
      else if (qIdx > 0 && !q.explicitTag && q.interruptedFromPrev && paragraphFirstSpeaker) {
        speakerName = paragraphFirstSpeaker;
        attributionSource = quotes[0].explicitTag ? 'regex' : 'context_continuation';
        confidence = quotes[0].explicitTag ? 0.93 : 0.85;
      }
      // 3. Explicit named speaker tag
      else if (q.explicitTag && q.explicitTag.kind === 'name') {
        speakerName = canonicalize(q.explicitTag.name);
        attributionSource = 'regex';
        confidence = 0.95;
      }
      // 4. Explicit pronoun tag ("cried I", "he remarked", "she asked")
      else if (q.explicitTag && q.explicitTag.kind === 'pronoun') {
        if (q.explicitTag.pronounType === 'first_person') {
          speakerName = firstPersonSpeaker || firstPersonIdentity;
          attributionSource = 'regex';
          confidence = 0.90;
          resolvedViaFirstPerson = true;
        } else if (q.explicitTag.pronounType === 'male') {
          if (lastMaleSpeaker) {
            speakerName = lastMaleSpeaker;
          } else {
            const lookMale = peekAheadExplicit(pIdx, 'male');
            if (lookMale.length > 0) {
              speakerName = lookMale[0].name;
            } else if (firstPersonSpeaker && inferSpeakerGender(firstPersonSpeaker) === 'male') {
              speakerName = firstPersonSpeaker;
            } else {
              // Fallback: check recentSpeakers for a known non-female speaker
              const maleRecent = [...recentSpeakers].reverse().find(
                (s) => (knownGenders.get(s) || inferSpeakerGender(s)) !== 'female' && s !== 'Dr. Watson'
              );
              speakerName = maleRecent || null;
            }
          }
          if (speakerName) {
            attributionSource = 'context_continuation';
            confidence = 0.85;
          }
        } else if (q.explicitTag.pronounType === 'female') {
          if (lastFemaleSpeaker) {
            speakerName = lastFemaleSpeaker;
          } else {
            const lookFemale = peekAheadExplicit(pIdx, 'female');
            if (lookFemale.length > 0) {
              speakerName = lookFemale[0].name;
            } else {
              const femaleRecent = [...recentSpeakers].reverse().find(
                (s) => (knownGenders.get(s) || inferSpeakerGender(s)) === 'female'
              );
              speakerName = femaleRecent || null;
            }
          }
          if (speakerName) {
            attributionSource = 'context_continuation';
            confidence = 0.85;
          }
        }
      }
      // 5. Same-paragraph follow-up quote with no intervening explicit switch
      else if (qIdx > 0 && paragraphFirstSpeaker && !q.explicitTag && !q.actionBeat) {
        speakerName = paragraphFirstSpeaker;
        attributionSource = 'context_continuation';
        confidence = 0.80;
      }
      // 6. Action beat in same paragraph ("Watson stared. \"Really?\"")
      else if (q.actionBeat) {
        if (q.actionBeat.kind === 'name') {
          speakerName = canonicalize(q.actionBeat.name);
          attributionSource = 'context_continuation';
          confidence = 0.82;
        } else if (q.actionBeat.kind === 'pronoun') {
          if (q.actionBeat.pronounType === 'first_person') {
            speakerName = firstPersonSpeaker || firstPersonIdentity;
            resolvedViaFirstPerson = true;
          } else if (q.actionBeat.pronounType === 'male') {
            speakerName = lastMaleSpeaker;
          } else if (q.actionBeat.pronounType === 'female') {
            speakerName = lastFemaleSpeaker;
          }
          if (speakerName) {
            attributionSource = 'context_continuation';
            confidence = 0.78;
          }
        }
      }

      // 7. Conversational Turn-Taking & 2-Paragraph Delayed Lookahead when still untagged
      if (!speakerName && turnTaking) {
        if (recentSpeakers.length >= 2) {
          // Alternate cleanly between the last two speakers in the scene
          const [older, newer] = recentSpeakers;
          if (lastDialogueSpeaker && isSameSpeaker(lastDialogueSpeaker, newer)) {
            speakerName = older;
          } else {
            speakerName = newer;
          }
          attributionSource = 'alternation';
          confidence = 0.76;
        } else if (recentSpeakers.length === 1) {
          const active = recentSpeakers[0];
          const look = peekAheadExplicit(pIdx);
          // Even turn offset relative to current turn (e.g. turnOffset === 2) shares this turn's speaker
          const evenMatch = look.find((item) => item.turnOffset % 2 === 0 && !isSameSpeaker(item.name, active));
          if (evenMatch) {
            speakerName = evenMatch.name;
          } else {
            speakerName = active === 'Speaker B' ? 'Speaker A' : 'Speaker B';
          }
          attributionSource = 'alternation';
          confidence = 0.72;
        } else {
          // Dialogue starts before explicit names are tagged: scan up to 2 turns/paragraphs ahead
          const look = peekAheadExplicit(pIdx);
          const evenMatch = look.find((item) => item.turnOffset % 2 === 0);
          if (evenMatch) {
            speakerName = evenMatch.name;
          } else {
            speakerName = 'Speaker A';
          }
          attributionSource = 'alternation';
          confidence = 0.68;
        }
      }

      // Final unresolved fallback (when turnTaking === false and no tag/pronoun resolved)
      if (!speakerName) {
        speakerName = 'Unresolved';
        attributionSource = 'unresolved';
        confidence = 0.30;
      }

      recordSpeakerState(speakerName, resolvedViaFirstPerson);
      if (qIdx === 0) {
        paragraphFirstSpeaker = speakerName;
      }

      unclosedContinuationSpeaker = q.unclosedAtEnd ? speakerName : null;

      let gender = knownGenders.get(speakerName) || inferSpeakerGender(speakerName);
      if (speakerName === 'Dr. Watson') gender = 'male';

      segments.push({
        segment_id: `seg-${segCounter++}`,
        type: 'dialogue',
        speaker_name: speakerName,
        speaker_id: slugifySpeakerId(speakerName),
        speaker_gender: gender,
        assigned_voice_id: null,
        text: q.text.trim(),
        attribution_confidence: confidence,
        attribution_source: attributionSource,
      });

      cursor = q.end;
    }

    // Trailing narration after the last quote in the paragraph
    if (cursor < para.length) {
      const narrAfter = para.slice(cursor).trim();
      if (narrAfter.length > 0) {
        segments.push(makeNarrationSeg(narrAfter));
      }
    }
  }

  const unified = unifyCharacterEntities(segments, []);

  return {
    chapter_id: chapterId,
    title,
    segments: unified.segments,
    characters: unified.characters,
  };
}

const UNIFY_COURTESY_TITLES = new Set(['mr', 'mrs', 'ms', 'miss']);

const UNIFY_TITLE_KEY_MAP = {
  mr: 'mr',
  mrs: 'mrs',
  ms: 'ms',
  miss: 'miss',
  dr: 'dr',
  doctor: 'dr',
  sir: 'sir',
  lord: 'lord',
  lady: 'lady',
  professor: 'prof',
  prof: 'prof',
  captain: 'capt',
  capt: 'capt',
  inspector: 'inspector',
  insp: 'inspector',
  detective: 'detective',
  st: 'st',
  saint: 'st',
  father: 'father',
  mother: 'mother',
  aunt: 'aunt',
  uncle: 'uncle',
  general: 'general',
  gen: 'general',
  colonel: 'colonel',
  col: 'colonel',
  major: 'major',
  maj: 'major',
  rev: 'rev',
  reverend: 'rev',
  sgt: 'sgt',
  sergeant: 'sgt',
  lt: 'lt',
  lieutenant: 'lt',
  supt: 'supt',
  superintendent: 'supt',
};

const UNIFY_NON_ENTITY_IDS = new Set([
  '',
  'narrator',
  'unresolved',
  'unknown',
  'unknown_speaker',
  'speaker_a',
  'speaker_b',
  'dialogue_turn_even',
  'dialogue_turn_odd',
  'dialogue_speaker',
  'image',
  'illustration',
  'speaker',
  'character',
]);

function parseEntitySurface(rawName) {
  const raw = String(rawName || '').trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  let titlePrefix = '';
  let titleKey = '';
  let coreStart = 0;

  if (tokens.length >= 2) {
    const firstBare = tokens[0].replace(/\.+$/, '').toLowerCase();
    if (UNIFY_TITLE_KEY_MAP[firstBare]) {
      titlePrefix = tokens[0];
      titleKey = UNIFY_TITLE_KEY_MAP[firstBare];
      coreStart = 1;
    }
  }

  const coreTokens = tokens.slice(coreStart);
  const coreLower = coreTokens.map((t) => t.replace(/\.+$/, '').toLowerCase()).filter(Boolean);
  const surname = coreLower.length > 0 ? coreLower[coreLower.length - 1] : '';
  const isCourtesy = UNIFY_COURTESY_TITLES.has(titleKey);
  const gender = inferSpeakerGender(raw);

  return {
    raw,
    titlePrefix,
    titleKey,
    isCourtesy,
    coreTokens,
    coreLower,
    surname,
    gender,
  };
}

function gendersConflict(gA, gB) {
  return gA && gB && gA !== 'unknown' && gB !== 'unknown' && gA !== gB;
}

function titlesConflict(tA, tB) {
  return Boolean(tA && tB && tA !== tB);
}

/**
 * Unify surface mentions referring to the same character entity across segments and characters[]
 * (e.g. "Mr. Sherlock Holmes", "Sherlock Holmes", "Mr. Holmes", "Holmes" -> "Sherlock Holmes",
 * "Dr. John Watson", "Dr. Watson", "Watson" -> "Dr. John Watson") while keeping distinct family
 * members with conflicting titles or given names separate (e.g. "Mr. Dursley" vs "Mrs. Dursley").
 *
 * @param {Array<object>} segments
 * @param {Array<object>} [characters=[]]
 * @returns {{ segments: Array<object>, characters: Array<object> }}
 */
function unifyCharacterEntities(segments = [], characters = []) {
  const segList = Array.isArray(segments) ? segments : [];
  const charList = Array.isArray(characters) ? characters : [];

  const surfaceRecords = new Map(); // rawLower -> { surface, gender, descriptions, quotes, voiceIds, inputLineCount }

  const registerSurface = (rawName, meta = {}) => {
    const clean = String(rawName || '').trim();
    if (!clean) return;
    const slug = slugifySpeakerId(clean);
    if (UNIFY_NON_ENTITY_IDS.has(slug)) return;
    const key = clean.toLowerCase();
    if (!surfaceRecords.has(key)) {
      surfaceRecords.set(key, {
        surface: parseEntitySurface(clean),
        gender: meta.gender === 'male' || meta.gender === 'female' ? meta.gender : 'unknown',
        description: meta.description ? String(meta.description).trim() : '',
        sampleQuote: meta.sample_quote ? String(meta.sample_quote).trim() : '',
        voiceId: typeof meta.voice_id === 'string' && meta.voice_id ? meta.voice_id : null,
        inputLineCount: Number(meta.line_count) || 0,
      });
    } else {
      const rec = surfaceRecords.get(key);
      if (rec.gender === 'unknown' && (meta.gender === 'male' || meta.gender === 'female')) {
        rec.gender = meta.gender;
      }
      if (!rec.description && meta.description) rec.description = String(meta.description).trim();
      if (!rec.sampleQuote && meta.sample_quote) rec.sampleQuote = String(meta.sample_quote).trim();
      if (!rec.voiceId && typeof meta.voice_id === 'string' && meta.voice_id) rec.voiceId = meta.voice_id;
      if (meta.line_count) rec.inputLineCount += Number(meta.line_count) || 0;
    }
  };

  let inputNarratorMeta = null;
  for (const c of charList) {
    if (!c || typeof c !== 'object') continue;
    const cname = String(c.name || c.speaker_name || c.canonical_name || '').trim();
    const cid = slugifySpeakerId(c.character_id || cname);
    if (cid === 'narrator') {
      inputNarratorMeta = c;
      continue;
    }
    if (cname) {
      registerSurface(cname, {
        gender: c.gender,
        description: c.description,
        sample_quote: c.sample_quote,
        voice_id: typeof c.voice_id === 'string' ? c.voice_id : null,
        line_count: c.line_count,
      });
    }
  }

  for (const seg of segList) {
    if (!seg || seg.type !== 'dialogue') continue;
    const sname = String(seg.speaker_name || '').trim();
    const sid = slugifySpeakerId(seg.speaker_id || sname);
    if (UNIFY_NON_ENTITY_IDS.has(sid)) continue;
    registerSurface(sname || sid, {
      gender: seg.speaker_gender || seg.gender,
      voice_id: typeof seg.assigned_voice_id === 'string'
        ? seg.assigned_voice_id
        : (typeof seg.voice_id === 'string' ? seg.voice_id : null),
    });
  }

  // Build clusters from distinct surface records
  // Process longer/titled core forms first, then untitled/shorter forms
  const records = Array.from(surfaceRecords.values());
  records.sort((a, b) => {
    const lenDiff = b.surface.coreLower.length - a.surface.coreLower.length;
    if (lenDiff !== 0) return lenDiff;
    const titleDiff = (b.surface.titleKey ? 1 : 0) - (a.surface.titleKey ? 1 : 0);
    if (titleDiff !== 0) return titleDiff;
    return b.surface.raw.length - a.surface.raw.length;
  });

  const clusters = [];

  const getClusterGender = (cluster) => {
    for (const r of cluster.records) {
      if (r.gender === 'male' || r.gender === 'female') return r.gender;
      if (r.surface.gender === 'male' || r.surface.gender === 'female') return r.surface.gender;
    }
    return 'unknown';
  };

  const getClusterTitles = (cluster) =>
    new Set(cluster.records.map((r) => r.surface.titleKey).filter(Boolean));

  const isClusterCompatibleWithRecord = (cluster, rec) => {
    const cGender = getClusterGender(cluster);
    const rGender = rec.gender !== 'unknown' ? rec.gender : rec.surface.gender;
    if (gendersConflict(cGender, rGender)) return false;

    const cTitles = getClusterTitles(cluster);
    if (rec.surface.titleKey) {
      for (const ct of cTitles) {
        if (titlesConflict(ct, rec.surface.titleKey)) return false;
      }
    }
    return true;
  };

  // Pass 1: Exact coreLower clustering (first titled/multi-token, then untitled)
  const untitledExactPending = [];
  for (const rec of records) {
    if (rec.surface.coreLower.length === 0) continue;
    const coreKey = rec.surface.coreLower.join(' ');
    if (!rec.surface.titleKey) {
      untitledExactPending.push({ rec, coreKey });
      continue;
    }
    const match = clusters.find(
      (cl) => cl.coreKey === coreKey && isClusterCompatibleWithRecord(cl, rec)
    );
    if (match) {
      match.records.push(rec);
    } else {
      clusters.push({
        coreKey,
        coreLower: rec.surface.coreLower,
        surname: rec.surface.surname,
        records: [rec],
      });
    }
  }

  for (const { rec, coreKey } of untitledExactPending) {
    const exactMatches = clusters.filter((cl) => cl.coreKey === coreKey);
    const compatMatches = exactMatches.filter((cl) => isClusterCompatibleWithRecord(cl, rec));
    // Only merge untitled mention into exact-core cluster if unambiguous (no conflicting siblings like Mr. vs Mrs. Dursley)
    if (compatMatches.length === 1 && exactMatches.length === 1) {
      compatMatches[0].records.push(rec);
    } else if (compatMatches.length === 0 && exactMatches.length === 0) {
      clusters.push({
        coreKey,
        coreLower: rec.surface.coreLower,
        surname: rec.surface.surname,
        records: [rec],
      });
    } else {
      // Ambiguous untitled exact match (e.g. bare "Dursley" when both "Mr. Dursley" & "Mrs. Dursley" exist) -> keep separate
      clusters.push({
        coreKey,
        coreLower: rec.surface.coreLower,
        surname: rec.surface.surname,
        records: [rec],
      });
    }
  }

  // Pass 2: Merge single-token clusters into unambiguous multi-token full-name clusters
  const isClusterCompatibleWithCluster = (target, src) => {
    const tGender = getClusterGender(target);
    const sGender = getClusterGender(src);
    if (gendersConflict(tGender, sGender)) return false;

    const tTitles = getClusterTitles(target);
    const sTitles = getClusterTitles(src);
    for (const st of sTitles) {
      for (const tt of tTitles) {
        if (titlesConflict(tt, st)) return false;
      }
    }
    return true;
  };

  const singleClusters = clusters.filter((cl) => cl.coreLower.length === 1);
  const multiClusters = clusters.filter((cl) => cl.coreLower.length >= 2);
  const mergedAway = new Set();

  for (const sCl of singleClusters) {
    const tok = sCl.coreLower[0];
    if (!tok) continue;
    const sTitles = getClusterTitles(sCl);

    // 2a. Surname match against multi-token full-name clusters
    const surnameAll = multiClusters.filter((mCl) => mCl.surname === tok);
    if (surnameAll.length > 0) {
      const surnameCompat = surnameAll.filter((mCl) => isClusterCompatibleWithCluster(mCl, sCl));
      const conflictingSingleSiblings = singleClusters.filter(
        (other) => other !== sCl && other.surname === tok && !isClusterCompatibleWithCluster(other, sCl)
      );
      if (
        surnameCompat.length === 1 &&
        (sTitles.size > 0 || (surnameAll.length === 1 && conflictingSingleSiblings.length === 0))
      ) {
        surnameCompat[0].records.push(...sCl.records);
        mergedAway.add(sCl);
        continue;
      }
    }

    // 2b. Given-name match for untitled single-token mentions (e.g. "Harry" -> "Harry Potter")
    if (sTitles.size === 0 && surnameAll.length === 0) {
      const givenAll = multiClusters.filter((mCl) => mCl.coreLower[0] === tok);
      const givenCompat = givenAll.filter((mCl) => isClusterCompatibleWithCluster(mCl, sCl));
      if (givenCompat.length === 1 && givenAll.length === 1) {
        givenCompat[0].records.push(...sCl.records);
        mergedAway.add(sCl);
      }
    }
  }

  const finalClusters = clusters.filter((cl) => !mergedAway.has(cl));

  // Choose canonical display name & character_id for each cluster
  const surfaceToCanonical = new Map();
  const canonicalEntities = new Map(); // canonicalId -> entity meta

  for (const cl of finalClusters) {
    const maxCoreLen = Math.max(...cl.records.map((r) => r.surface.coreTokens.length));
    const longestRecords = cl.records.filter((r) => r.surface.coreTokens.length === maxCoreLen);

    // Prefer non-courtesy title (Dr., Professor, Lord, Lady, Inspector, etc.) if any member carries one
    const nonCourtesyTitled = cl.records.filter(
      (r) => r.surface.titlePrefix && !r.surface.isCourtesy
    );
    const courtesyTitled = cl.records.filter(
      (r) => r.surface.titlePrefix && r.surface.isCourtesy
    );

    const bestCoreTokens = longestRecords[0].surface.coreTokens;
    let canonicalName = bestCoreTokens.join(' ');

    if (nonCourtesyTitled.length > 0) {
      // Prefer longest member with non-courtesy title, or prefer standard abbreviated 'Dr.' over 'Doctor'
      const preferred =
        nonCourtesyTitled.find((r) => r.surface.coreTokens.length === maxCoreLen && r.surface.titlePrefix === 'Dr.') ||
        nonCourtesyTitled.find((r) => r.surface.coreTokens.length === maxCoreLen) ||
        nonCourtesyTitled.find((r) => r.surface.titlePrefix === 'Dr.') ||
        nonCourtesyTitled[0];
      canonicalName = `${preferred.surface.titlePrefix} ${bestCoreTokens.join(' ')}`.trim();
    } else if (maxCoreLen >= 2) {
      // Full given + surname known: drop generic courtesy prefix ("Mr. Sherlock Holmes" -> "Sherlock Holmes")
      const untitledLongest = longestRecords.find((r) => !r.surface.titlePrefix);
      canonicalName = (untitledLongest ? untitledLongest.surface.coreTokens : bestCoreTokens).join(' ');
    } else if (courtesyTitled.length > 0) {
      // Surname-only entity with courtesy title (e.g. "Mr. Dursley", "Mrs. Dursley", "Mrs. Hudson")
      canonicalName = `${courtesyTitled[0].surface.titlePrefix} ${bestCoreTokens.join(' ')}`.trim();
    }

    const canonicalId = slugifySpeakerId(canonicalName);
    const resolvedGender = getClusterGender(cl);

    let description = '';
    let sampleQuote = '';
    let voiceId = null;
    let inputLineCount = 0;
    for (const r of cl.records) {
      if (!description && r.description) description = r.description;
      if (!sampleQuote && r.sampleQuote) sampleQuote = r.sampleQuote;
      if (!voiceId && typeof r.voiceId === 'string' && r.voiceId) voiceId = r.voiceId;
      inputLineCount += r.inputLineCount || 0;
      surfaceToCanonical.set(r.surface.raw.toLowerCase(), {
        character_id: canonicalId,
        name: canonicalName,
        gender: resolvedGender,
      });
    }

    if (!canonicalEntities.has(canonicalId)) {
      canonicalEntities.set(canonicalId, {
        character_id: canonicalId,
        name: canonicalName,
        speaker_name: canonicalName,
        gender: resolvedGender,
        description,
        line_count: 0,
        input_line_count: inputLineCount,
        sample_quote: sampleQuote,
        voice_id: voiceId,
      });
    } else {
      const existing = canonicalEntities.get(canonicalId);
      if (existing.gender === 'unknown' && resolvedGender !== 'unknown') existing.gender = resolvedGender;
      if (!existing.description && description) existing.description = description;
      if (!existing.sample_quote && sampleQuote) existing.sample_quote = sampleQuote;
      if (!existing.voice_id && voiceId) existing.voice_id = voiceId;
      existing.input_line_count += inputLineCount;
    }
  }

  let narrationCount = 0;
  let narratorSample = '';

  const rewrittenSegments = segList.map((seg) => {
    if (!seg) return seg;
    if (seg.type === 'narration' || seg.speaker_id === 'narrator') {
      narrationCount += 1;
      if (!narratorSample && seg.text) narratorSample = String(seg.text).trim().slice(0, 220);
      return seg;
    }
    if (seg.type !== 'dialogue') return seg;

    const rawName = String(seg.speaker_name || '').trim();
    const rawId = slugifySpeakerId(seg.speaker_id || rawName);
    if (UNIFY_NON_ENTITY_IDS.has(rawId)) return seg;

    const mapped = surfaceToCanonical.get((rawName || rawId).toLowerCase());
    if (!mapped) return seg;

    const ent = canonicalEntities.get(mapped.character_id);
    if (ent) {
      ent.line_count += 1;
      if (!ent.sample_quote && seg.text) {
        ent.sample_quote = String(seg.text).trim().slice(0, 220);
      }
      if (!ent.voice_id) {
        const segVoice =
          typeof seg.assigned_voice_id === 'string' && seg.assigned_voice_id
            ? seg.assigned_voice_id
            : (typeof seg.voice_id === 'string' && seg.voice_id ? seg.voice_id : null);
        if (segVoice) ent.voice_id = segVoice;
      }
    }

    const segGender =
      seg.speaker_gender === 'male' || seg.speaker_gender === 'female'
        ? seg.speaker_gender
        : (seg.gender === 'male' || seg.gender === 'female' ? seg.gender : mapped.gender);

    const updatedSeg = {
      ...seg,
      speaker_id: mapped.character_id,
      speaker_name: mapped.name,
      speaker_gender: segGender,
    };
    if ('character_id' in seg) {
      updatedSeg.character_id = mapped.character_id;
    }
    if ('gender' in seg) {
      updatedSeg.gender = segGender;
    }
    return updatedSeg;
  });

  const mergedCharacters = [];
  if (inputNarratorMeta) {
    mergedCharacters.push({
      character_id: 'narrator',
      name: 'Narrator',
      speaker_name: 'Narrator',
      gender: inputNarratorMeta.gender || 'male',
      description: inputNarratorMeta.description || 'Primary narrative voice',
      line_count: narrationCount > 0 ? narrationCount : (Number(inputNarratorMeta.line_count) || 0),
      sample_quote: inputNarratorMeta.sample_quote || narratorSample || 'Primary narrative voice.',
      voice_id: typeof inputNarratorMeta.voice_id === 'string' ? inputNarratorMeta.voice_id : 'en-GB-RyanNeural',
    });
  }

  for (const ent of canonicalEntities.values()) {
    mergedCharacters.push({
      character_id: ent.character_id,
      name: ent.name,
      speaker_name: ent.name,
      gender: ent.gender,
      description: ent.description || '',
      line_count: ent.line_count > 0 ? ent.line_count : ent.input_line_count,
      sample_quote: ent.sample_quote || '',
      voice_id: ent.voice_id || null,
    });
  }

  return {
    segments: rewrittenSegments,
    characters: mergedCharacters,
  };
}

module.exports = {
  parseChapter,
  unifyCharacterEntities,
  cleanSpeakerName,
  extractTagAfter,
  extractTagBefore,
  inferSpeakerGender,
  isSameSpeaker,
  SPEECH_VERBS,
};
