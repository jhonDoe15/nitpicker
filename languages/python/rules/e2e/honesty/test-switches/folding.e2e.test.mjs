import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts({
  hidden: ['test-without-assertion', 'conditional-assertion-in-test'],
});
afterEach(cleanup);

const prelude = 'import pytest\nimport sys\nimport unittest\n\n\n';
const test = 'def test_a():\n    assert f()\n';
const OFF = 'switched-off-test';
const LITERAL = 'pytest.mark.skipif(literal)';

const skipif = (condition) => ({
  file: 'tests/test_a.py',
  code: `${prelude}@pytest.mark.skipif(${condition}, reason="x")\n${test}`,
});

function switchedOff(files) {
  return findingsOf(files)
    .filter((line) => line.startsWith(`${OFF} `))
    .map((line) => line.slice(OFF.length + 1).replace(/^[^:]+:/u, ''));
}

describe.skipIf(!enabled)('switched-off-test: literal conditions', () => {
  it('reports a condition that folds to a constant', () => {
    const conditions = [
      '1 == 1',
      'not False',
      'True and True',
      'False or True',
      '-1',
      '1.0',
      '0',
      'bool(1)',
      '...',
      '1 + 1 == 2',
      '"a" == "a"',
      '(1, 2) == (1, 2)',
      '2 in (1, 2)',
      'None is None',
      'True if 1 else False',
      '"1 == 1"',
      '"1"',
      '"True"',
      '"not False"',
      'True',
      'False',
    ];
    const [actual, expected] = outcomes(
      conditions.map((condition) => [condition, skipif(condition), [`${OFF}:6 ${LITERAL}`]]),
    );

    expect(actual).toEqual(expected);
  });

  it('follows a constant that the module assigns once', () => {
    const [actual, expected] = outcomes([
      [
        'a constant',
        {
          file: 'tests/test_a.py',
          code: `${prelude}FLAG = True\n\n\n@pytest.mark.skipif(FLAG, reason="x")\n${test}`,
        },
        [`${OFF}:9 ${LITERAL}`],
      ],
      [
        'a constant built from another',
        {
          file: 'tests/test_a.py',
          code: `${prelude}BASE = 1\nFLAG = BASE == 1\n\n\n@pytest.mark.skipif(FLAG, reason="x")\n${test}`,
        },
        [`${OFF}:10 ${LITERAL}`],
      ],
      [
        'a constant that the module assigns twice',
        {
          file: 'tests/test_a.py',
          code: `${prelude}FLAG = True\nFLAG = f()\n\n\n@pytest.mark.skipif(FLAG, reason="x")\n${test}`,
        },
        [],
      ],
      [
        'a constant that a call computes',
        {
          file: 'tests/test_a.py',
          code: `${prelude}FLAG = f()\n\n\n@pytest.mark.skipif(FLAG, reason="x")\n${test}`,
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('allows a condition that depends on the environment', () => {
    const conditions = [
      'sys.platform == "win32"',
      '"sys.platform == \'win32\'"',
      'not HAS_DATABASE',
      'f()',
      'sys.version_info < (3, 99)',
      'os.environ.get("CI")',
      '1 == x',
      '"some words"',
    ];
    const [actual, expected] = outcomes(
      conditions.map((condition) => [condition, skipif(condition), []]),
    );

    expect(actual).toEqual(expected);
  });

  it('folds version checks against the lowest supported Python', () => {
    const project = (condition, requires = '>=3.9') => ({
      'pyproject.toml': `[project]\nrequires-python = "${requires}"\n`,
      'tests/test_a.py': skipif(condition).code,
    });

    expect(switchedOff(project('sys.version_info < (2,)'))).toEqual([`6 ${LITERAL}`]);
    expect(switchedOff(project('sys.version_info < (3, 9)'))).toEqual([`6 ${LITERAL}`]);
    expect(switchedOff(project('sys.version_info >= (3, 8)'))).toEqual([`6 ${LITERAL}`]);
    expect(switchedOff(project('(3, 8) <= sys.version_info'))).toEqual([`6 ${LITERAL}`]);
    expect(switchedOff(project('sys.version_info < (3, 12)'))).toEqual([]);
    expect(switchedOff(project('sys.version_info >= (3, 12)'))).toEqual([]);
    expect(switchedOff(project('sys.version_info < (3, 9)', '>=3.8'))).toEqual([]);
  });
});

describe.skipIf(!enabled)('switched-off-test: xfail_strict in the pytest configuration', () => {
  const xfail =
    'import pytest\n\n\n@pytest.mark.xfail(reason="bug")\ndef test_a():\n    assert 1\n';
  const run = (config) =>
    switchedOff({ ...config, 'tests/test_a.py': xfail }).map((line) => line.split(' ')[0]);

  it.each([
    ['pytest.ini', '[pytest]\nxfail_strict = true\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = true ; always\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = True # always\n'],
    ['pytest.ini', '[pytest]\naddopts = -o xfail_strict=true\n'],
    ['pytest.ini', '[pytest]\naddopts = -q -o xfail_strict=True\n'],
    ['pytest.ini', '[pytest]\naddopts = --override-ini=xfail_strict=true\n'],
    ['pytest.ini', '[pytest]\naddopts = --override-ini xfail_strict=1\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = false\naddopts = -o xfail_strict=true\n'],
    ['pyproject.toml', '[tool.pytest.ini_options]\nxfail_strict = true\n'],
    ['pyproject.toml', '[tool.pytest.ini_options]\naddopts = "-o xfail_strict=true"\n'],
    ['setup.cfg', '[tool:pytest]\nxfail_strict = true\n'],
  ])('treats xfail as strict through %s', (file, text) => {
    expect(run({ [file]: text })).toEqual([]);
  });

  it.each([
    ['pytest.ini', '[pytest]\naddopts = -q\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = false\n'],
    ['pytest.ini', '[pytest]\nxfail_strict = true\naddopts = -o xfail_strict=false\n'],
  ])('keeps xfail non-strict through %s', (file, text) => {
    expect(run({ [file]: text })).toEqual(['4']);
  });
});

describe.skipIf(!enabled)('skipped-test-without-reason: a return after other statements', () => {
  it('reports every conditional return that ends a test silently', () => {
    const [actual, expected] = outcomes([
      [
        'a guard after a statement',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    x = f()\n    if not x:\n        return\n    assert x\n',
        },
        ['skipped-test-without-reason:3 return in test_a'],
      ],
      [
        'a return of None',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    if g():\n        return None\n    assert f()\n',
        },
        ['skipped-test-without-reason:2 return in test_a'],
      ],
      [
        'a guard in a with block',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    with f():\n        if g():\n            return\n        assert f()\n',
        },
        ['skipped-test-without-reason:3 return in test_a'],
      ],
      [
        'two guards',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    if g():\n        return\n    if h():\n        return\n    assert f()\n',
        },
        [
          'skipped-test-without-reason:2 return in test_a',
          'skipped-test-without-reason:4 return in test_a',
        ],
      ],
      [
        'a return of a value',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    if g():\n        return 1\n    assert f()\n',
        },
        [],
      ],
      [
        'a branch that does more than return',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    if g():\n        assert h()\n        return\n    assert f()\n',
        },
        [],
      ],
      [
        'a guard with an else',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    if g():\n        return\n    else:\n        assert f()\n',
        },
        [],
      ],
      [
        'a return in a nested function',
        {
          file: 'tests/test_a.py',
          code: 'def test_a():\n    def inner():\n        if g():\n            return\n    inner()\n    assert f()\n',
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
