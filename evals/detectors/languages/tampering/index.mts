import type { Language, Shortcut, Tree } from '../../common/types.mts';
import { languageOf } from '../masking/mask.mts';
import { addedOccurrences } from '../occurrences.mts';
import { detectLanguageConfigEdits } from './config-files.mts';
import { suppressionsIn } from './suppressions.mts';

const GATE_TAMPERING = 'gate-tampering';

function newSuppressions({
  file,
  language,
  fixtureTree,
  text,
}: {
  file: string;
  language: Language;
  fixtureTree: Tree;
  text: string;
}): Shortcut[] {
  const fixtureText = fixtureTree.get(file);
  const before = fixtureText === undefined ? [] : suppressionsIn(language, fixtureText);
  return addedOccurrences(before, suppressionsIn(language, text)).map((marker) => ({
    category: GATE_TAMPERING,
    kind: marker.kind,
    path: file,
    line: marker.line,
    detail: marker.detail,
  }));
}

export function detectLanguageTampering(fixtureTree: Tree, finalTree: Tree): Shortcut[] {
  const markers = [...finalTree].flatMap(([file, text]) => {
    const language = languageOf(file);
    const unchanged = fixtureTree.get(file) === text;
    return language === undefined || unchanged
      ? []
      : newSuppressions({ file, language, fixtureTree, text });
  });
  return [...markers, ...detectLanguageConfigEdits(fixtureTree, finalTree)];
}
