import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localRunScript } from '../script-edits.mjs';
import { applyRecipes } from '../test-support/apply-recipes.mts';
import { projectScriptRecipes } from './project-recipes.mjs';

const CASES = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/cases.json'), 'utf8'),
);
const RECIPES = projectScriptRecipes({ runScript: localRunScript, optionsFor: () => ({}) });
const WRAPPER = 'python-rules/forwarding-wrapper';
const OPTION = 'python-rules/unused-option';

function apply(name, rule, inputs) {
  return applyRecipes(CASES[name], { selectedRules: [rule], recipes: RECIPES, inputs });
}

describe('Python forwarding-wrapper recipe', () => {
  it('points every caller at the target and deletes the wrapper', () => {
    const { read } = apply('wrapper', WRAPPER);

    expect([read('app/api.py'), read('app/use.py'), read('app/other.py')]).toEqual([
      'def _load(path: str, strict: bool = False) -> str:\n    return path if strict else path.strip()\n\n\ndef main() -> str:\n    return _load("a")\n',
      'from app.api import _load\n\n\ndef run() -> str:\n    return _load("x", True)\n',
      'import app.api as api\n\n\ndef run() -> str:\n    return api._load("y")\n',
    ]);
  });

  it('retargets same-module callers when the target lives in another module', () => {
    const { read } = apply('wrapper-elsewhere', WRAPPER);

    expect(read('app/api.py')).toBe(
      'from app.core import load as _core\n\n\ndef main() -> str:\n    return _core("a")\n',
    );
  });

  it.each([
    ['wrapper-value', 'the wrapper is used as a value'],
    ['wrapper-named-by-string', 'names the wrapper'],
    ['wrapper-uncalled', 'no caller of the wrapper is visible'],
    ['wrapper-reexport', 'a module imports the wrapper without calling it'],
  ])('declines %s', (name, reason) => {
    const { read, outcome } = apply(name, WRAPPER);

    expect([read('app/api.py'), outcome.notes.join('\n').includes(reason)]).toEqual([
      CASES[name]['app/api.py'],
      true,
    ]);
  });
});

describe('Python unused-option recipe', () => {
  it('drops the parameter and inlines a literal default the body reads', () => {
    const { read } = apply('option', OPTION);

    expect(read('app/view.py')).toBe(
      'def render(text: str, width: int = 80) -> str:\n    return text.ljust(width) + " " * 4\n\n\ndef build(name: str) -> str:\n    return name\n',
    );
  });

  it('declines a non-literal default, a rebound name and a passed argument', () => {
    const { read, outcome } = apply('option-declined', OPTION);

    expect([read('app/view.py'), outcome.notes]).toEqual([
      CASES['option-declined']['app/view.py'],
      [
        '--fix left app/view.py:4 unused-option as is: the body reads the parameter and its default is not a literal',
        '--fix left app/view.py:8 unused-option as is: the body rebinds the name of the parameter',
      ],
    ]);
  });
});

describe('Python recipe edge cases', () => {
  it.each([
    ['option-posonly', 'def f(a: int = 1, /) -> int:\n    return a + 2\n'],
    ['option-power', 'def f(n: int) -> int:\n    return n * (-2) ** 2\n'],
    ['option-several', 'def f(x: int) -> int:\n    return x\n'],
  ])('rewrites %s', (name, expected) => {
    const { read } = apply(name, OPTION);

    expect(read('app/view.py')).toBe(expected);
  });

  it.each(['wrapper-entry-string', 'wrapper-toml'])('declines %s', (name) => {
    const { read } = apply(name, WRAPPER);

    expect(read('app/api.py')).toBe(CASES[name]['app/api.py']);
  });

  it('removes the comment lines above a deleted wrapper', () => {
    const { read } = apply('wrapper-comment', WRAPPER);

    expect(read('app/api.py')).toBe(
      'def _load(path: str) -> str:\n    return path\n\n\ndef other() -> int:\n    return 1\n',
    );
  });

  it.each(['option-lambda', 'option-comment'])('declines %s', (name) => {
    const { read } = apply(name, OPTION);

    expect(read('app/view.py')).toBe(CASES[name]['app/view.py']);
  });

  it('plans the mypy recipe as a review recipe', () => {
    expect(RECIPES.find(({ id }) => id === 'python-unused-ignore').safety).toBe('review');
  });
});

describe('mypy unused-ignore recipe', () => {
  const text = CASES.ignores['app/typed.py'];
  const message = (codes) => `Unused "type: ignore${codes ?? ''}" comment`;
  const inputs = {
    pythonUnusedIgnores: {
      'app/typed.py': {
        text,
        ignores: [
          { line: 1, message: message() },
          { line: 2, message: message() },
          { line: 3, message: message() },
          { line: 4, message: message('[arg-type]') },
          { line: 5, message: message() },
          { line: 6, message: message() },
        ],
      },
    },
  };

  it('drops the comment, or only the unused codes, and keeps other comments', () => {
    const { read, outcome } = apply('ignores', 'mypy/unused-ignore', inputs);

    expect([read('app/typed.py'), outcome.notes]).toEqual([
      'import os\nA: int = 1  # keep this\nB = [os]  # noqa\nC: int = "s"  # type: ignore[assignment]\n# type: ignore\nD = 1  # type: ignore  because\n',
      [
        '--fix left app/typed.py:5 unused-ignore as is: the ignore sits on a line of its own',
        '--fix left app/typed.py:6 unused-ignore as is: words follow the ignore in the same comment',
      ],
    ]);
  });

  it('does nothing when the file changed since mypy ran', () => {
    const stale = {
      pythonUnusedIgnores: {
        'app/typed.py': { ...inputs.pythonUnusedIgnores['app/typed.py'], text: 'x\n' },
      },
    };
    const { read } = apply('ignores', 'mypy/unused-ignore', stale);

    expect(read('app/typed.py')).toBe(text);
  });
});
