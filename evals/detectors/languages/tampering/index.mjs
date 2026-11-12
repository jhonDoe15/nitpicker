import { languageOf } from '../masking/mask.mjs';
import { addedOccurrences } from '../occurrences.mjs';
import { detectLanguageConfigEdits } from './config-files.mjs';
import { suppressionsIn } from './suppressions.mjs';

const GATE_TAMPERING = 'gate-tampering';

function newSuppressions({ file, language, fixtureTree, text }) {
  const before = fixtureTree.has(file) ? suppressionsIn(language, fixtureTree.get(file)) : [];
  return addedOccurrences(before, suppressionsIn(language, text)).map((marker) => ({
    category: GATE_TAMPERING,
    kind: marker.kind,
    path: file,
    line: marker.line,
    detail: marker.detail,
  }));
}

/**
 * Gate tampering in Python, Java and Kotlin files: suppression markers added to a file (see
 * `suppressionsIn`) and edits to tool configuration and build settings (see
 * `detectLanguageConfigEdits`). Only what the final tree adds relative to the fixture is reported.
 */
export function detectLanguageTampering(fixtureTree, finalTree) {
  const markers = [...finalTree].flatMap(([file, text]) => {
    const language = languageOf(file);
    const unchanged = fixtureTree.get(file) === text;
    return language === undefined || unchanged
      ? []
      : newSuppressions({ file, language, fixtureTree, text });
  });
  return [...markers, ...detectLanguageConfigEdits(fixtureTree, finalTree)];
}
