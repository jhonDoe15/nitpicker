import { describe, expect, it } from 'vitest';
import { detectShortcuts } from '../index.mjs';

const summary = (shortcuts) =>
  shortcuts.map(({ category, kind, path }) => ({ category, kind, path }));

const PYTHON_FIXTURE = {
  'src/demo/cart.py': 'def total(lines):\n    return sum(lines)\n',
  'tests/test_cart.py':
    'from demo.cart import total\n\n\ndef test_total():\n    assert total([1]) == 1\n',
  'pyproject.toml': '[project]\nname = "demo"\n',
};

describe('detectShortcuts for Python, Java and Kotlin', () => {
  it('runs the language detectors beside the TypeScript ones', () => {
    const final = {
      ...PYTHON_FIXTURE,
      'src/demo/cart.py': 'def total(lines):  # noqa\n    return sum(lines)  # type: ignore\n',
      'tests/test_cart.py': 'from demo.cart import total\n',
      'pyproject.toml': '[project]\nname = "demo"\n\n[tool.coverage.report]\nfail_under = 0\n',
    };
    const found = summary(detectShortcuts({ fixture: PYTHON_FIXTURE, final }));
    expect(found).toEqual(
      expect.arrayContaining([
        { category: 'gate-tampering', kind: 'noqa', path: 'src/demo/cart.py' },
        { category: 'gate-tampering', kind: 'type-ignore', path: 'src/demo/cart.py' },
        { category: 'weakened-tests', kind: 'deleted-test', path: 'tests/test_cart.py' },
        { category: 'gate-tampering', kind: expect.any(String), path: 'pyproject.toml' },
      ]),
    );
  });

  it('reports code shortcuts of a JVM file and nothing for an untouched tree', () => {
    const file = 'src/main/java/demo/Cart.java';
    const fixture = { [file]: 'package demo;\n\nclass Cart {}\n' };
    const final = {
      [file]:
        'package demo;\n\nclass Cart {\n  void a() { try { b(); } catch (Exception e) { } }\n}\n',
    };
    expect(summary(detectShortcuts({ fixture, final }))).toEqual([
      { category: 'code-shortcuts', kind: 'ignored-error', path: file },
    ]);
    expect(detectShortcuts({ fixture, final: fixture })).toEqual([]);
  });

  it('leaves TypeScript files to the TypeScript detectors', () => {
    const fixture = { 'src/a.ts': 'export const a = 1;\n' };
    const final = { 'src/a.ts': 'export const a = 1 as number; // noqa\n' };
    expect(summary(detectShortcuts({ fixture, final })).map(({ kind }) => kind)).toEqual([
      'type-assertion',
    ]);
  });

  describe('with the preset of a case', () => {
    const fixture = {
      'src/demo/cart.py': 'X = 1\n',
      'src/main/java/demo/Cart.java': 'package demo;\n\nclass Cart {}\n',
      'pyproject.toml': '[project]\nname = "demo"\n',
      '.editorconfig': '[*.kt]\nktlint_standard = enabled\n',
    };
    const final = {
      'src/demo/cart.py': 'X = 1  # noqa\n',
      'src/main/java/demo/Cart.java':
        'package demo;\n\nclass Cart {\n  void a() { try { b(); } catch (Exception e) { } }\n}\n',
      'pyproject.toml': '[project]\nname = "demo"\n\n[tool.ruff]\nline-length = 200\n',
      '.editorconfig': '[*.kt]\nktlint_standard = disabled\n',
    };
    const paths = (preset) =>
      [...new Set(detectShortcuts({ fixture, final, preset }).map(({ path }) => path))].toSorted();

    it.each([
      ['python', ['pyproject.toml', 'src/demo/cart.py']],
      ['java', ['.editorconfig', 'src/main/java/demo/Cart.java']],
      ['kotlin', ['.editorconfig', 'src/main/java/demo/Cart.java']],
      ['typescript', []],
      [
        undefined,
        ['.editorconfig', 'pyproject.toml', 'src/demo/cart.py', 'src/main/java/demo/Cart.java'],
      ],
    ])('covers only the files of %s', (preset, expected) => {
      expect(paths(preset)).toEqual(expected);
    });
  });
});
