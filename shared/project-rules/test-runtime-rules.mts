import type { LanguageColumns, RuleEntry } from './typed/rule-types.mts';

export function testConsoleRule(ids: { readonly testConsoleOutput: string }): RuleEntry {
  return {
    id: ids.testConsoleOutput,
    check: 'test-console',
    limit:
      'a test file printing console.error or console.warn output (Python: stderr, warnings and log records at WARNING or above; Go: lines at WARN or ERROR level and standard `log` lines; compared as text with numbers and paths normalized, one random-looking word tolerated) that the base run did not print',
  };
}

export function slowTest(
  ids: { readonly slowTest: string },
  defaults: { readonly unitTestSeconds: number; readonly integrationTestSeconds: number },
  enforcedBy: LanguageColumns,
): RuleEntry {
  return {
    id: ids.slowTest,
    check: 'test-runtime',
    limit: `a test the change adds or edits taking more than ${String(defaults.unitTestSeconds)} s (unit) or ${String(defaults.integrationTestSeconds)} s (integration); override with \`thresholds.unitTestSeconds\` and \`thresholds.integrationTestSeconds\``,
    enforcedBy,
  };
}

export const GO_NO_TYPE_ONLY =
  'the language has no import that exists only for the type checker: every import links and initializes the package, so a test that only names a production type still depends on that package at run time and is judged by `no-production-runtime`';

export const NO_TYPE_ONLY =
  'the language has no import that exists only for the type checker: a production type that a test names only as an erased generic argument leaves no reference in the bytecode, so the test is reported as `no-production-runtime`';
