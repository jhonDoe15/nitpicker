import { describe, expect, it } from 'vitest';
import { between, changesOf } from './test-support/policy-fixtures.mjs';

const PYTHON = { preset: 'python' };
const OPTIONS = '[tool.pytest.ini_options]\n';
const files = (pyproject, extra = {}) => ({
  'pyproject.toml': pyproject,
  'src/app/__init__.py': '',
  'src/app/core.py': 'x = 1\n',
  'tests/test_core.py': 'def test_x():\n    pass\n',
  'src/app/test_inner.py': 'def test_y():\n    pass\n',
  ...extra,
});
const run = (base, head, extra = {}) =>
  between({ base: files(base, extra), head: files(head, extra), config: PYTHON });
const QUIET = `${OPTIONS}addopts = "-q"\n`;

describe('pytest testpaths', () => {
  it('counts testpaths that leave collected tests out', () => {
    expect(run(QUIET, `${OPTIONS}testpaths = ["tests"]\n`).policyLoosenings).toEqual([
      'pytest testpaths no longer includes checked code: src/app/test_inner.py',
    ]);
  });

  it('keeps testpaths that still hold every test, and a removed list', () => {
    expect(run(QUIET, `${OPTIONS}testpaths = ["tests", "src"]\n`).policyLoosenings).toEqual([]);
    expect(run(`${OPTIONS}testpaths = ["tests"]\n`, QUIET).policyLoosenings).toEqual([]);
  });

  it('lists only files pytest collects, not helpers beside the tests', () => {
    const extra = { 'src/app/helpers/fixtures.py': 'y = 1\n', 'src/app/helpers/test_z.py': '' };

    expect(run(QUIET, `${OPTIONS}testpaths = ["tests"]\n`, extra).policyLoosenings).toEqual([
      'pytest testpaths no longer includes checked code: src/app/helpers/test_z.py, src/app/test_inner.py',
    ]);
  });
});

describe('pytest addopts', () => {
  it('counts an added --ignore or --ignore-glob that covers a test', () => {
    const head = `${OPTIONS}addopts = "-q --ignore=tests --ignore-glob=src/app/test_*.py"\n`;

    expect(run(QUIET, head).policyLoosenings).toEqual([
      'pytest addopts --ignore and --ignore-glob added: tests',
      'pytest addopts --ignore and --ignore-glob added: src/app/test_*.py',
    ]);
  });

  it('only lists an --ignore of a folder that holds no collected test', () => {
    const extra = { 'tests/fixtures/sample/broken_module.py': 'def g(:\n' };

    expect(changesOf(run(QUIET, `${OPTIONS}addopts = "--ignore=tests/fixtures"\n`, extra))).toEqual(
      {
        policyLoosenings: [],
        policyChanges: [
          'pytest addopts --ignore and --ignore-glob added: tests/fixtures (covers no checked file it did not cover before)',
        ],
      },
    );
  });

  it.each([
    ['--deselect', '--deselect tests/test_core.py::test_x'],
    ['-m', "-m 'not slow'"],
    ['-k', "-k 'not x'"],
  ])('leaves %s to the run, which strips it, and the uncollected-tests rule', (_, option) => {
    const head = `${OPTIONS}addopts = "${option.replaceAll('"', '\\"')}"\n`;

    expect(run(QUIET, head).policyLoosenings).toEqual([]);
  });
});

describe('mutmut', () => {
  it('counts a mutmut do_not_mutate pattern that covers production code', () => {
    const base = '[tool.mutmut]\npaths_to_mutate = "src"\n';
    const head =
      '[tool.mutmut]\npaths_to_mutate = "src"\ndo_not_mutate = ["src/app/core.py", "docs/*"]\n';

    expect(changesOf(run(base, head))).toEqual({
      policyLoosenings: ['mutmut do_not_mutate added: src/app/core.py'],
      policyChanges: [
        'mutmut do_not_mutate added: src/app/core.py',
        'mutmut do_not_mutate added: docs/* (covers no checked file it did not cover before)',
      ],
    });
  });
});
