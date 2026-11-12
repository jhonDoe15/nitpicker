import { describe, expect, it } from 'vitest';
import { pythonE2eEnabled } from '../../e2e/test-support/python-e2e-support.mjs';
import { realLintFindings } from '../test-support/real-lint.mjs';

const APP = [
  'def handle(*args):',
  '    print("ready")',
  '',
  '',
  'class Shop:',
  '    def visit(self, *args):',
  '        return 1',
  '',
  '',
  'def badName(items=Shop()):',
  '    return items',
  '',
].join('\n');
const TEST = 'def test_shop():\n    print("checked")\n';
const PYPROJECT = [
  '[tool.poetry]',
  'name = "shop"',
  '',
  '[tool.ruff.lint]',
  'extend-select = ["D1", "B008"]',
  'ignore = ["T201", "D107"]',
  '',
  '[tool.ruff.lint.per-file-ignores]',
  '"tests/*" = ["D", "T201"]',
  '',
  '[tool.ruff.lint.pep8-naming]',
  'extend-ignore-names = ["badName"]',
  '',
  '[tool.ruff.lint.flake8-unused-arguments]',
  'ignore-variadic-names = false',
  '',
].join('\n');
const FILES = { 'src/shop/app.py': APP, 'tests/test_shop.py': TEST, 'pyproject.toml': PYPROJECT };
const NITPICKER_RULES = ['T201 src/shop/app.py', 'T201 tests/test_shop.py'];
const PROJECT_RULES = [
  'D100 src/shop/app.py',
  'D101 src/shop/app.py',
  'D102 src/shop/app.py',
  'D103 src/shop/app.py',
  'D103 src/shop/app.py',
];
const TERNARY = [
  'def pick(flag):',
  '    if flag:',
  '        chosen_label_for_the_report = "the first rather long label text"',
  '    else:',
  '        chosen_label_for_the_report = "the other long label"',
  '    return chosen_label_for_the_report',
  '',
].join('\n');
const GOOGLE_DOCSTRING = [
  '"""Fetch values."""',
  '',
  '',
  'def fetch(key):',
  '    """Fetch a key.',
  '',
  '    Args:',
  '        key: The key.',
  '',
  '    Returns:',
  '        The value.',
  '    """',
  '    return key',
  '',
].join('\n');
const TYPED_IMPORT = [
  'from __future__ import annotations',
  '',
  'from shop.models import Item',
  '',
  '',
  'def name(item: Item) -> str:',
  '    return str(item)',
  '',
].join('\n');
const UNUSED_VARIADIC = ['ARG001 src/shop/app.py', 'ARG002 src/shop/app.py'];

function findings(precedence, options = {}) {
  return realLintFindings({
    files: FILES,
    toolPrecedence: precedence === undefined ? undefined : { ruff: precedence },
    ...options,
  });
}

describe.skipIf(!pythonE2eEnabled)('ruff lint with the project config end to end', () => {
  it('runs nitpicker rules and options only, without the opt-in', () => {
    expect(findings(undefined)).toEqual(['N802 src/shop/app.py', ...NITPICKER_RULES]);
    expect(findings(['nitpicker'])).toEqual(['N802 src/shop/app.py', ...NITPICKER_RULES]);
  });

  it('adds the project rules and lets its options win when the project is listed first', () => {
    const expected = [
      ...UNUSED_VARIADIC,
      'B008 src/shop/app.py',
      ...PROJECT_RULES,
      ...NITPICKER_RULES,
    ].toSorted();

    expect(findings(['project', 'nitpicker'])).toEqual(expected);
    expect(findings(['project'])).toEqual(expected);
  });

  it('keeps the rules nitpicker ignores off and its option values when nitpicker is first', () => {
    expect(findings(['nitpicker', 'project'])).toEqual(
      ['N802 src/shop/app.py', ...PROJECT_RULES, ...NITPICKER_RULES].toSorted(),
    );
  });

  it('lets ruff resolve the project selection, with its docstring convention', () => {
    const files = {
      'src/shop/fetch.py': GOOGLE_DOCSTRING,
      'ruff.toml': '[lint]\nextend-select = ["D"]\n\n[lint.pydocstyle]\nconvention = "google"\n',
    };

    expect(realLintFindings({ files, toolPrecedence: { ruff: ['project', 'nitpicker'] } })).toEqual(
      [],
    );
  });

  it('keeps nitpicker rules when the project selects none', () => {
    const files = { 'src/shop/app.py': 'print("ready")\n', 'ruff.toml': '[lint]\nselect = []\n' };

    expect(realLintFindings({ files, toolPrecedence: { ruff: ['project'] } })).toEqual([
      'T201 src/shop/app.py',
    ]);
  });

  it('follows the codes ruff redirects, in the selection and in the per-file ignores', () => {
    const files = {
      'src/shop/models.py': 'class Item:\n    pass\n',
      'src/shop/view.py': TYPED_IMPORT,
      'src/shop/other.py': TYPED_IMPORT,
      'ruff.toml': [
        '[lint]',
        'extend-select = ["TCH"]',
        '',
        '[lint.per-file-ignores]',
        '"src/shop/other.py" = ["TCH001"]',
        '',
      ].join('\n'),
    };

    expect(realLintFindings({ files, toolPrecedence: { ruff: ['project'] } })).toEqual([
      'TC001 src/shop/view.py',
    ]);
  });

  it('reads the config from the head checkout and resolves its paths in the snapshot', () => {
    const files = { 'src/shop/app.py': APP, 'tests/test_shop.py': TEST };

    expect(
      findings(['project', 'nitpicker'], { files, policyFiles: { 'pyproject.toml': PYPROJECT } }),
    ).toEqual(
      [...UNUSED_VARIADIC, 'B008 src/shop/app.py', ...PROJECT_RULES, ...NITPICKER_RULES].toSorted(),
    );
  });

  it('follows the extend chain and adds the project excludes to nitpicker', () => {
    const files = {
      'src/shop/app.py': 'print("ready")\n',
      'src/gen/made.py': 'print("made")\n',
      'src/legacy/old.py': 'print("old")\n',
      'ruff.toml': 'extend = "config/shared.toml"\nextend-exclude = ["src/gen"]\n',
      'config/shared.toml': '[lint]\nextend-select = ["D100"]\n',
    };

    expect(
      realLintFindings({
        files,
        toolPrecedence: { ruff: ['project', 'nitpicker'] },
        exclude: ['src/legacy/**'],
      }),
    ).toEqual(['D100 src/shop/app.py', 'T201 src/shop/app.py']);
  });

  it('checks against the followed line length in every ordering', () => {
    const wide = { 'src/shop/pick.py': TERNARY, 'ruff.toml': 'line-length = 120\n' };
    const measured = (lineLength) => ({ 'python.lineLength': lineLength });
    const lineFindings = (precedence, conventions) =>
      realLintFindings({
        files: wide,
        toolPrecedence: precedence === undefined ? undefined : { ruff: precedence },
        conventions,
      });
    const ternary = ['SIM108 src/shop/pick.py'];

    expect(lineFindings(undefined, undefined)).toEqual([]);
    expect(lineFindings(undefined, measured('120'))).toEqual(ternary);
    expect(lineFindings(['nitpicker'], measured('120'))).toEqual(ternary);
    expect(lineFindings(['project', 'nitpicker'], undefined)).toEqual(ternary);
    expect(lineFindings(['project'], measured('120'))).toEqual(ternary);
    expect(lineFindings(['project', 'nitpicker'], measured('88'))).toEqual([]);
    expect(lineFindings(['nitpicker', 'project'], undefined)).toEqual([]);
    expect(lineFindings(['nitpicker', 'project'], measured('120'))).toEqual(ternary);
  });

  it('fails when the project is listed without a ruff config, or with one that does not parse', () => {
    const files = { 'src/shop/app.py': 'VALUE = 1\n' };

    expect(() =>
      realLintFindings({ files, toolPrecedence: { ruff: ['project', 'nitpicker'] } }),
    ).toThrow(/"tools\.ruff\.precedence" lists "project" but a ruff config .* is missing/);
    expect(() =>
      realLintFindings({
        files: { ...files, 'ruff.toml': '[lint\nselect = ["F"]\n' },
        toolPrecedence: { ruff: ['project'] },
      }),
    ).toThrow(/The ruff config .*ruff\.toml could not be parsed/);
  });
});
