import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');

// Banned technical words per Section 1 user-facing language rules
const BANNED_WORDS = [
  'backend',
  'server',
  'api',
  'endpoint',
  'websocket',
  'cache',
  'pipeline',
  'model',
  'engine',
  'tts',
  'neural',
  'sota',
  'edge',
  'kokoro',
  'llm',
  'regex',
  'fallback',
  'standby',
  'bitrate',
  'khz',
  '24khz',
  'mp3',
  'cbr',
  '4nf',
  'dual-tts',
  'latency',
  '60fps',
  'sync engine',
  'models_cache',
  'rule-based',
  'attribution',
  'synthesis',
];

// Regex to capture visible JSX text or user-facing attributes
const BANNED_REGEX = new RegExp(
  `\\b(${BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

function getFiles(dir, exts = ['.jsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '__tests__' && file !== 'test') {
        results = results.concat(getFiles(fullPath, exts));
      }
    } else if (exts.includes(path.extname(file))) {
      results.push(fullPath);
    }
  }
  return results;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip import statements, comments, console logs, and purely code attributes
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('console.') ||
      trimmed.includes('api.') ||
      trimmed.includes('import(')
    ) {
      continue;
    }

    // Check for user-facing JSX text content: >Some text< or attributes like placeholder="...", title="...", aria-label="..."
    const textMatches = line.match(/>([^<>{]+)</g);
    if (textMatches) {
      for (const tm of textMatches) {
        const text = tm.slice(1, -1).trim();
        if (text && BANNED_REGEX.test(text)) {
          const match = text.match(BANNED_REGEX)[0];
          issues.push({ line: i + 1, match, text });
        }
      }
    }

    const attrMatches = line.match(/(placeholder|title|aria-label|alt)=["']([^"']+)["']/g);
    if (attrMatches) {
      for (const am of attrMatches) {
        if (BANNED_REGEX.test(am)) {
          const match = am.match(BANNED_REGEX)[0];
          issues.push({ line: i + 1, match, text: am });
        }
      }
    }
  }

  return issues;
}

export function runLanguageAudit() {
  const files = getFiles(SRC_DIR);
  let totalIssues = 0;
  console.log(`\n🔍 Scanning ${files.length} JSX source files for banned technical language...\n`);

  for (const file of files) {
    const issues = scanFile(file);
    if (issues.length > 0) {
      console.log(`❌ ${path.relative(SRC_DIR, file)}:`);
      for (const iss of issues) {
        console.log(`   Line ${iss.line}: Banned word "${iss.match}" found in: "${iss.text}"`);
      }
      totalIssues += issues.length;
    }
  }

  if (totalIssues > 0) {
    console.error(`\n❌ Language Audit FAILED: Found ${totalIssues} instances of banned technical vocabulary.\n`);
    return false;
  }

  console.log('✔ Language Audit PASSED: Zero banned technical words found in user-facing UI strings.\n');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const passed = runLanguageAudit();
  process.exit(passed ? 0 : 1);
}
