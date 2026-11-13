import type { Language, Occurrence, Shortcut, Tree } from '../../common/types.mts';
import { languageOf, maskSource } from '../masking/mask.mts';
import { addedOccurrences } from '../occurrences.mts';
import { isBuildFile, isTestFile } from '../project-files.mts';
import { crossFeatureImports } from './features.mts';
import { jvmShortcuts } from './jvm.mts';
import { pythonShortcuts } from './python.mts';

const CODE_SHORTCUTS = 'code-shortcuts';
const KINDS_IN_TESTS = new Set(['ignored-error', 'broad-catch', 'non-null-assertion']);

function occurrencesIn({
  language,
  file,
  text,
  tree,
}: {
  language: Language;
  file: string;
  text: string;
  tree: Tree;
}): Occurrence[] {
  const masked = maskSource(language, text).masked;
  const own =
    language === 'python' ? pythonShortcuts({ masked, text }) : jvmShortcuts({ language, masked });
  if (isTestFile(language, file)) return own.filter(({ kind }) => KINDS_IN_TESTS.has(kind));
  const kept = maskSource(language, text, { keepStrings: true }).masked;
  return [...own, ...crossFeatureImports({ language, file, masked, kept, tree })];
}

export function detectLanguageCodeShortcuts(fixtureTree: Tree, finalTree: Tree): Shortcut[] {
  return [...finalTree].flatMap(([file, text]) => {
    const language = languageOf(file);
    if (language === undefined || isBuildFile(file) || fixtureTree.get(file) === text) return [];
    const fixtureText = fixtureTree.get(file);
    const before =
      fixtureText === undefined
        ? []
        : occurrencesIn({ language, file, text: fixtureText, tree: fixtureTree });
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
