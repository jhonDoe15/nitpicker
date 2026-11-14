import type { Family, Shortcut, Tree } from '../common/types.mts';
import { familyOf } from './project-files.mts';
import { detectLanguageCodeShortcuts } from './shortcuts/index.mts';
import { detectLanguageTampering } from './tampering/index.mts';
import { detectLanguageWeakenedTests } from './tests/weakened.mts';

const ALL_FAMILIES: readonly Family[] = ['python', 'jvm'];
const FAMILIES = new Map<string, readonly Family[]>([
  ['python', ['python']],
  ['java', ['jvm']],
  ['kotlin', ['jvm']],
  ['typescript', []],
  ['javascript', []],
]);

function onlyFamilies(tree: Tree, families: readonly Family[]): Tree {
  return new Map(
    [...tree].filter(([file]) => {
      const family = familyOf(file);
      return family !== undefined && families.includes(family);
    }),
  );
}

export function detectLanguageShortcuts(
  fixtureTree: Tree,
  finalTree: Tree,
  { preset }: { preset?: string | undefined } = {},
): Shortcut[] {
  const families = (preset === undefined ? undefined : FAMILIES.get(preset)) ?? ALL_FAMILIES;
  const fixture = onlyFamilies(fixtureTree, families);
  const final = onlyFamilies(finalTree, families);
  return [
    ...detectLanguageTampering(fixture, final),
    ...detectLanguageWeakenedTests(fixture, final),
    ...detectLanguageCodeShortcuts(fixture, final),
  ];
}
