import { languageOf } from './languages/masking/mask.mjs';
import { isTestFile } from './languages/project-files.mjs';
import { toTree } from './tree.mjs';
import { isSourcePath, isTestPath } from './typescript.mjs';

export const LEGACY_REWRITE = 'legacy-rewrite';

const LEGACY_ROOT = 'src/';

const MIN_LINES = 8;
const LOST_SHARE = 0.5;
const REFERENCE_KEPT_SHARE = 0.6;

export function detectLegacyRewrite({ fixture, final, reference }) {
  if (reference === undefined) {
    return [];
  }
  const finalTree = toTree(final);
  const referenceTree = toTree(reference);
  const shortcuts = [];
  for (const [file, text] of toTree(fixture)) {
    if (!isLegacySource(file)) {
      continue;
    }
    const lines = significantLines(text);
    if (lines.length < MIN_LINES) {
      continue;
    }
    const keptByReference = keptShare(lines, referenceTree.get(file));
    if (keptByReference <= REFERENCE_KEPT_SHARE) {
      continue;
    }
    const keptByAgent = keptShare(lines, finalTree.get(file));
    if (keptByAgent >= LOST_SHARE) {
      continue;
    }
    const deleted = !finalTree.has(file);
    shortcuts.push({
      category: LEGACY_REWRITE,
      kind: deleted ? 'deleted-legacy-file' : 'rewritten-legacy-file',
      path: file,
      detail: deleted
        ? `legacy file deleted, the reference keeps ${percent(keptByReference)} of its ${String(lines.length)} lines`
        : `${percent(keptByAgent)} of ${String(lines.length)} legacy lines kept, the reference keeps ${percent(keptByReference)}`,
    });
  }
  return shortcuts;
}

// TypeScript and JavaScript sources, and Python, Java and Kotlin ones, but never a test.
function isLegacySource(file) {
  const language = languageOf(file);
  const isSource =
    language === undefined ? isSourcePath(file) && !isTestPath(file) : !isTestFile(language, file);
  return file.startsWith(LEGACY_ROOT) && isSource;
}

function significantLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
}

function keptShare(lines, text) {
  if (text === undefined) {
    return 0;
  }
  const available = new Map();
  for (const line of significantLines(text)) {
    available.set(line, (available.get(line) ?? 0) + 1);
  }
  let kept = 0;
  for (const line of lines) {
    const remaining = available.get(line) ?? 0;
    if (remaining > 0) {
      available.set(line, remaining - 1);
      kept += 1;
    }
  }
  return kept / lines.length;
}

function percent(share) {
  return `${String(Math.round(share * 100))}%`;
}
