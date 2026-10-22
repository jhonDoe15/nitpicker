import { languageOf, maskSource } from '../masking/mask.mjs';
import { addedOccurrences } from '../occurrences.mjs';
import { isTestFile } from '../tests/patterns.mjs';
import { crossFeatureImports } from './features.mjs';
import { jvmShortcuts } from './jvm.mjs';
import { pythonShortcuts } from './python.mjs';

const CODE_SHORTCUTS = 'code-shortcuts';
// What still counts in a test file; type escapes and broad catches are ordinary there.
const KINDS_IN_TESTS = new Set(['ignored-error']);

function occurrencesIn({ language, file, text, tree }) {
  const masked = maskSource(language, text).masked;
  const own =
    language === 'python' ? pythonShortcuts({ masked, text }) : jvmShortcuts({ language, masked });
  if (isTestFile(language, file)) return own.filter(({ kind }) => KINDS_IN_TESTS.has(kind));
  return [...own, ...crossFeatureImports({ language, file, masked, tree })];
}

/**
 * Code shortcuts in Python, Java and Kotlin files, from the fixture to the final tree. Kinds:
 * `any`, `type-assertion`, `non-null-assertion`, `ignored-error`, `broad-catch` (see
 * `pythonShortcuts` and `jvmShortcuts`) and `cross-feature-import` (see `crossFeatureImports`).
 * Only occurrences the final tree adds to a file are reported; they are compared as counts per
 * file and signature, not by line, so editing or moving existing code does not trigger.
 */
export function detectLanguageCodeShortcuts(fixtureTree, finalTree) {
  return [...finalTree].flatMap(([file, text]) => {
    const language = languageOf(file);
    if (language === undefined || fixtureTree.get(file) === text) return [];
    const before = fixtureTree.has(file)
      ? occurrencesIn({ language, file, text: fixtureTree.get(file), tree: fixtureTree })
      : [];
    const after = occurrencesIn({ language, file, text, tree: finalTree });
    return addedOccurrences(before, after).map((found) => ({
      category: CODE_SHORTCUTS,
      kind: found.kind,
      path: file,
      line: found.line,
      detail: found.detail,
    }));
  });
}
