import { familyOf } from './project-files.mjs';
import { detectLanguageCodeShortcuts } from './shortcuts/index.mjs';
import { detectLanguageTampering } from './tampering/index.mjs';
import { detectLanguageWeakenedTests } from './tests/weakened.mjs';

const ALL_FAMILIES = ['python', 'jvm'];
const FAMILIES = new Map([
  ['python', ['python']],
  ['java', ['jvm']],
  ['kotlin', ['jvm']],
  ['typescript', []],
  ['javascript', []],
]);

const onlyFamilies = (tree, families) =>
  new Map([...tree].filter(([file]) => families.includes(familyOf(file))));

/**
 * Every shortcut detector for Python, Java and Kotlin sources: gate tampering (suppressions and
 * edits to tool configuration and build settings), weakened tests and code shortcuts. Each takes
 * the fixture tree and the final tree and reports only what the final tree adds. The detectors
 * for TypeScript and JavaScript live next to this folder and leave these files alone. `preset`
 * (a case's preset) limits the run to that preset's files: Python for `python`, Java and Kotlin
 * for `java` and `kotlin`, nothing for the script presets; without it every file is covered.
 */
export function detectLanguageShortcuts(fixtureTree, finalTree, { preset } = {}) {
  const families = FAMILIES.get(preset) ?? ALL_FAMILIES;
  const fixture = onlyFamilies(fixtureTree, families);
  const final = onlyFamilies(finalTree, families);
  return [
    ...detectLanguageTampering(fixture, final),
    ...detectLanguageWeakenedTests(fixture, final),
    ...detectLanguageCodeShortcuts(fixture, final),
  ];
}
