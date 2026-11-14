import { describe, expect, it } from 'vitest';
import { applyRecipes } from './test-support/apply-recipes.mjs';

const FROZEN = ['python-rules/frozen-dataclass'];
const SHELL = ['python-rules/shell-command'];
const MUTMUT = ['mutmut/mutant-ignored'];
const POINT = 'from dataclasses import dataclass\n\n\n@dataclass\nclass Point:\n    x: int\n';

describe('frozen dataclass reads the project', () => {
  it('declines when another file extends the class', () => {
    const files = {
      'app/point.py': POINT,
      'app/other.py': 'from app.point import Point\n\n\nclass Named(Point):\n    label: str = ""\n',
    };

    const { read, outcome } = applyRecipes(files, { selectedRules: FROZEN });

    expect(read('app/point.py')).toBe(POINT);
    expect(outcome.notes).toEqual([
      '--fix left app/point.py:5 frozen-dataclass as is: another class in the project extends it',
    ]);
  });

  it('declines when a file outside the changed set assigns a field', () => {
    const files = {
      'app/point.py': POINT,
      'app/move.py': 'def shift(p):\n    p.x += 1\n',
    };

    const { read, outcome } = applyRecipes(files, { selectedRules: FROZEN });

    expect(read('app/point.py')).toBe(POINT);
    expect(outcome.notes).toEqual([
      '--fix left app/point.py:5 frozen-dataclass as is: the project assigns to an attribute with the name of a field',
    ]);
  });

  it('declines when setattr names a field', () => {
    const files = { 'app/point.py': POINT, 'app/set.py': 'def f(p):\n    setattr(p, "x", 2)\n' };

    const { read } = applyRecipes(files, { selectedRules: FROZEN });

    expect(read('app/point.py')).toBe(POINT);
  });

  it('still freezes a class nothing extends or assigns', () => {
    const files = { 'app/point.py': POINT, 'app/use.py': 'def f(p):\n    return p.x\n' };

    const { read } = applyRecipes(files, { selectedRules: FROZEN });

    expect(read('app/point.py')).toBe(POINT.replace('@dataclass', '@dataclass(frozen=True)'));
  });
});

describe('shell command edge cases', () => {
  it('declines a command with an unbalanced quote and keeps the other fixes', () => {
    const source =
      'import subprocess\n\n\ndef f():\n    subprocess.run(["bash", "-c", "echo \'a"])\n' +
      '    subprocess.run(["bash", "-c", "make all"])\n';

    const { read, outcome } = applyRecipes({ 'app/a.py': source }, { selectedRules: SHELL });

    expect(read('app/a.py')).toBe(
      'import subprocess\n\n\ndef f():\n    subprocess.run(["bash", "-c", "echo \'a"])\n' +
        '    subprocess.run(["make", "all"])\n',
    );
    expect(outcome.notes).toEqual([
      '--fix left app/a.py:5 shell-command as is: the command has an unbalanced quote',
    ]);
  });

  it.each(['time make', 'trap true EXIT', 'pushd build', 'declare -x A=1'])(
    'declines the shell builtin in %s',
    (command) => {
      const source = `import subprocess\n\n\ndef f():\n    subprocess.run(["bash", "-c", "${command}"])\n`;

      const { read } = applyRecipes({ 'app/a.py': source }, { selectedRules: SHELL });

      expect(read('app/a.py')).toBe(source);
    },
  );
});

describe('mutmut pragma removal', () => {
  it.each([
    ['X = 1  # pragma: no mutate because it is a limit\n', 'X = 1\n'],
    ['X = 1  # pragma: no mutate  # noqa\n', 'X = 1  # noqa\n'],
    ['X = 1  # keep this # pragma: no mutate\n', 'X = 1  # keep this\n'],
    ['# pragma: no mutate class\nX = 1\n', 'X = 1\n'],
    ['# note # pragma: no mutate\nX = 1\n', '# note\nX = 1\n'],
  ])('removes the pragma and its trailing words from %j', (before, after) => {
    const { read } = applyRecipes({ 'app/a.py': before }, { selectedRules: MUTMUT });

    expect(read('app/a.py')).toBe(after);
  });
});
