import { existsSync, readdirSync, readFileSync } from 'node:fs';

const FIXTURES = new URL('../fixtures/', import.meta.url);
const CASES_FILE = 'cases.json';

function fixtureCases(fixture) {
  const file = new URL(`${fixture}/${CASES_FILE}`, FIXTURES);
  if (!existsSync(file)) {
    return [];
  }
  return JSON.parse(readFileSync(file, 'utf8')).map((testCase) => ({
    name: `${testCase.rule} names "${testCase.mention}"`,
    fixture,
    ...testCase,
  }));
}

/**
 * The rule message cases, read from the `cases.json` of each fixture folder, so a new rule adds its
 * case next to its fixture and edits no shared table. A case without a `name` takes the default one.
 */
export function ruleCases() {
  return readdirSync(FIXTURES).toSorted().flatMap(fixtureCases);
}
