import { describe, expect, it } from 'vitest';
import { localRunScript } from '../script-edits.mts';
import { applyRecipes } from '../test-support/apply-recipes.mts';
import { loadCases, reasonsOf, testsLayout } from '../test-support/layout-cases.mts';
import { projectScriptRecipes } from './project-recipes.mts';

const HELPERS = loadCases(import.meta.dirname, 'helper-cases.json');
const RECIPES = projectScriptRecipes({
  runScript: localRunScript,
  optionsFor: testsLayout,
});
const HELPER = 'python-rules/test-helper-in-source';

function apply(name: string): ReturnType<typeof applyRecipes> {
  return applyRecipes(HELPERS[name] ?? {}, { selectedRules: [HELPER], recipes: RECIPES });
}

describe('Python test-helper-in-source recipe', () => {
  it('moves the helper into the tests package and updates the imports', () => {
    const { read, exists } = apply('helper');

    expect([
      exists('app/testing.py'),
      read('tests/support/__init__.py'),
      read('tests/support/testing.py'),
      read('tests/test_user.py'),
      read('tests/test_other.py'),
      read('tests/test_pkg.py'),
    ]).toEqual([
      false,
      '',
      'def make_user() -> dict:\n    return {"name": "a"}\n',
      'from tests.support.testing import make_user\n\n\ndef test_user():\n    assert make_user()\n',
      'import tests.support.testing as helpers\n\n\ndef test_other():\n    assert helpers.make_user()\n',
      'from tests.support import testing\n\n\ndef test_pkg():\n    assert testing.make_user()\n',
    ]);
  });

  it('moves a file of a helper folder and leaves the package marker', () => {
    const { read, exists, outcome } = apply('helper-folder');

    expect([
      exists('app/testing/factories.py'),
      read('tests/support/factories.py'),
      read('tests/test_user.py'),
      outcome.notes,
    ]).toEqual([
      false,
      'def make_user() -> dict:\n    return {"name": "a"}\n',
      'from tests.support.factories import make_user\n\n\ndef test_user():\n    assert make_user()\n',
      [
        '--fix left app/testing/__init__.py:1 test-helper-in-source as is: a package marker stays with its package',
      ],
    ]);
  });

  it('is a review recipe', () => {
    expect(RECIPES.find(({ id }) => id === 'python-test-helper-location')?.safety).toBe('review');
  });

  it.each([
    ['helper-production', 'app/service.py is production code that imports it'],
    ['helper-no-package', 'the project has no importable tests package to hold the helper'],
    ['helper-occupied', 'the new name exists'],
    ['helper-attribute', 'a caller imports the helper without a name of its own'],
    ['helper-string-prefix', 'a string or a non-Python file in the project names the helper'],
    ['helper-own-path', 'the helper locates files by its own path'],
    ['helper-relative', 'the helper imports by relative path'],
  ])('declines %s', (name, reason) => {
    const { read, outcome } = apply(name);
    const helper = HELPERS[name]?.['app/testing.py'];

    expect([read('app/testing.py'), reasonsOf(outcome.notes)]).toEqual([helper, [reason]]);
  });
});
