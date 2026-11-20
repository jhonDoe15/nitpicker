import { describe, expect, it } from 'vitest';
import { scriptRecipes } from '../python-recipes.mts';
import { localRunScript } from '../script-edits.mts';
import { applyRecipes } from '../test-support/apply-recipes.mts';
import { loadCases, testsLayout } from '../test-support/layout-cases.mts';

const CASES = loadCases(import.meta.dirname, 'cases.json');
const RECIPES = scriptRecipes({
  runScript: localRunScript,
  optionsFor: testsLayout,
});
const FILE = 'tests/test_flaky.py';

const MARKER_RULE = ['python-rules/retry-in-test'];
const TEST_NAMES = ['test_a', 'test_b', 'test_c'];
const BODY = '    assert 1\n';
const KEPT_LIBRARY = [
  'import pytest',
  'import tenacity',
  'from flaky import flaky',
  '',
  '',
  ...TEST_NAMES.flatMap((name) => [`def ${name}():`, BODY.trimEnd(), '', '']),
  '@tenacity.retry(',
  '    stop=tenacity.stop_after_attempt(3),',
  ')  # try again',
  '@pytest.mark.slow',
  'async def test_d():',
  BODY.trimEnd(),
  '',
].join('\n');

function apply(
  name: string,
  selectedRules: readonly string[] = [],
): ReturnType<typeof applyRecipes> {
  return applyRecipes(CASES[name] ?? {}, { recipes: RECIPES, selectedRules });
}

function notesOf(name: string, selectedRules: readonly string[] = []): string[] {
  return apply(name, selectedRules).outcome.notes.map((note) =>
    note.replace('--fix left tests/test_flaky.py:', ''),
  );
}

describe('Python retry-in-test recipes', () => {
  it('removes the flaky marks of test functions with plain --fix and keeps library retries', () => {
    const { read, outcome } = apply('retry');

    expect([read(FILE), outcome.fixedFindings.length]).toEqual([KEPT_LIBRARY, 3]);
  });

  it('removes a library retry decorator only when the rule is selected', () => {
    const { read } = apply('retry', MARKER_RULE);

    expect(read(FILE)).toBe(
      KEPT_LIBRARY.replace(
        '@tenacity.retry(\n    stop=tenacity.stop_after_attempt(3),\n)  # try again\n',
        '',
      ),
    );
  });

  it('plans the flaky recipe as safe and the library recipe as review', () => {
    expect(
      ['python-test-retry', 'python-test-retry-library'].map(
        (id) => RECIPES.find((recipe) => recipe.id === id)?.safety,
      ),
    ).toEqual(['safe', 'review']);
  });

  it('declines what is not a plain retry decorator of a test function', () => {
    const { read } = apply('retry-declined', MARKER_RULE);

    expect([read(FILE), notesOf('retry-declined', MARKER_RULE)]).toEqual([
      CASES['retry-declined']?.[FILE],
      [
        '4 retry-in-test as is: the retry is not a decorator of a test function',
        '9 retry-in-test as is: the decorator spreads its arguments, so what it sets is unknown',
        '19 retry-in-test as is: the decorator requires more than one passing run',
        '24 retry-in-test as is: the retry is not a decorator of a test function',
        '30 retry-in-test as is: the retry is not a decorator of a test function',
        '15 retry-in-test as is: the retry is not a decorator of a test function',
      ],
    ]);
  });
});
