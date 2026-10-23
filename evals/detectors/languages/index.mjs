import { detectLanguageCodeShortcuts } from './shortcuts/index.mjs';
import { detectLanguageTampering } from './tampering/index.mjs';
import { detectLanguageWeakenedTests } from './tests/weakened.mjs';

/**
 * Every shortcut detector for Python, Java and Kotlin sources: gate tampering (suppressions and
 * edits to tool configuration and build settings), weakened tests and code shortcuts. Each takes
 * the fixture tree and the final tree and reports only what the final tree adds. The detectors
 * for TypeScript and JavaScript live next to this folder and leave these files alone.
 */
export function detectLanguageShortcuts(fixtureTree, finalTree) {
  return [
    ...detectLanguageTampering(fixtureTree, finalTree),
    ...detectLanguageWeakenedTests(fixtureTree, finalTree),
    ...detectLanguageCodeShortcuts(fixtureTree, finalTree),
  ];
}
