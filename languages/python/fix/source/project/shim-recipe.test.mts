import { describe, expect, it } from 'vitest';
import { localRunScript } from '../script-edits.mts';
import { applyRecipes } from '../test-support/apply-recipes.mts';
import { loadCases, reasonsOf, testsLayout } from '../test-support/layout-cases.mts';
import { projectScriptRecipes } from './project-recipes.mts';

const SHIMS = loadCases(import.meta.dirname, 'shim-cases.json');
const RECIPES = projectScriptRecipes({
  runScript: localRunScript,
  optionsFor: testsLayout,
});
const SHIM = 'python-rules/compatibility-shim';

function apply(name: string): ReturnType<typeof applyRecipes> {
  return applyRecipes(SHIMS[name] ?? {}, { selectedRules: [SHIM], recipes: RECIPES });
}

describe('Python compatibility-shim recipe', () => {
  it('points every caller at the replacement and deletes the alias', () => {
    const { read } = apply('shim');

    expect([read('app/client.py'), read('app/use.py'), read('app/other.py')]).toEqual([
      'class Client:\n    pass\n\n\ndef make() -> Client:\n    return Client()\n',
      'from app.client import Client\n\n\ndef build() -> Client:\n    return Client()\n',
      'import app.client as client\n\n\ndef build():\n    return client.Client()\n',
    ]);
  });

  it('is a review recipe', () => {
    expect(RECIPES.find(({ id }) => id === 'python-compatibility-alias')?.safety).toBe('review');
  });

  it.each([
    ['shim-reexport', 'another module re-exports the alias'],
    ['shim-named', 'a string or a non-Python file in the project names the alias'],
    ['shim-renamed-import', 'a caller imports the alias under another name'],
    ['shim-package-attribute', 'another module re-exports the alias'],
    ['shim-unused', 'no use of the alias is visible in the project'],
    ['shim-imported-target', 'the replacement is not defined in the module of the alias'],
    ['shim-caller-binds-target', 'a caller already binds the name of the replacement'],
  ])('declines %s', (name, reason) => {
    const { read, outcome } = apply(name);

    expect([read('app/client.py'), reasonsOf(outcome.notes)]).toEqual([
      SHIMS[name]?.['app/client.py'],
      [reason],
    ]);
  });
});
