import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { fakePythonTools } from '../test-support/fake-python-fix.mjs';
import { REVIEW_CODES, reviewCodesSelected } from './review-rules.mjs';

const { createGitRepository } = useGitFixtures();
const RUFF_CONFIG = path.resolve(import.meta.dirname, '../../ruff/nitpicker-ruff.toml');
const PYPROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.10"\n';
const hasRuff = spawnSync('ruff', ['--version'], { timeout: 10_000 }).status === 0;

const PROMOTED = [
  [
    'PT018',
    'def test_a(x, y):\n    assert x and y\n',
    'def test_a(x, y):\n    assert x\n    assert y\n',
  ],
  [
    'RUF013',
    'def f(x: int = None):\n    return x\n',
    'def f(x: int | None = None):\n    return x\n',
  ],
  [
    'SIM103',
    'def f(x):\n    if x > 1:\n        return True\n    return False\n',
    'def f(x):\n    return x > 1\n',
  ],
];

const MOVED_TO_REVIEW = [
  ['E711', 'def f(x):\n    return x == None\n', 'def f(x):\n    return x is None\n'],
  ['RUF005', 'def f(a):\n    return [1] + a\n', 'def f(a):\n    return [1, *a]\n'],
  [
    'TRY201',
    'def f():\n    try:\n        pass\n    except ValueError as e:\n        raise e\n',
    'def f():\n    try:\n        pass\n    except ValueError as e:\n        raise\n',
  ],
];

const DROPS_COMMENTS = [
  ['B004', 'def f(o):\n    return hasattr(o,  # c\n "__call__")\n'],
  ['PERF102', 'def f(d):\n    for _, v in d.items(  # c\n):\n        print(v)\n'],
  ['RUF007', 'def f(a):\n    return list(zip(a,  # c\n a[1:]))\n'],
  ['RUF046', 'def f(x):\n    return int(round(x  # c\n))\n'],
  ['SIM201', 'def f(a, b):\n    return not (a  # c\n    == b)\n'],
  ['SIM202', 'def f(a, b):\n    return not (a  # c\n    != b)\n'],
  ['SIM210', 'def f(x):\n    return (True  # c\n      if x > 1 else False)\n'],
];

const UNPROMOTED = [
  ['E712', 'def f(x):\n    return x == True\n', 'def f(x):\n    return x\n'],
  ['T201', 'def f():\n    print(1)\n    return 2\n', 'def f():\n    return 2\n'],
  ['SIM118', 'def f(d):\n    return 1 in d.keys()\n', 'def f(d):\n    return 1 in d\n'],
];

function ruff(code, source, extra = []) {
  const result = spawnSync(
    'ruff',
    [
      'check',
      '--config',
      RUFF_CONFIG,
      '--target-version',
      'py310',
      '--select',
      code,
      '--fix-only',
      '--no-cache',
      ...extra,
      '--stdin-filename=x.py',
      '-',
    ],
    { input: source, encoding: 'utf8', timeout: 10_000 },
  );
  return result.stdout;
}

describe.skipIf(!hasRuff)('ruff fixes with the real ruff binary', () => {
  it.each(PROMOTED)('applies the promoted fix of %s', (code, before, after) => {
    expect(ruff(code, before)).toBe(after);
  });
  it.each(MOVED_TO_REVIEW)(
    'does not apply the behaviour-changing fix of %s on its own',
    (code, before) => {
      expect(ruff(code, before)).toBe(before);
    },
  );
  it.each(MOVED_TO_REVIEW)(
    'applies the fix of %s as a reviewed unsafe fix',
    (code, before, after) => {
      expect(ruff(code, before, ['--unsafe-fixes'])).toBe(after);
    },
  );
  it.each(DROPS_COMMENTS)(
    'does not apply the fix of %s when it would drop a comment',
    (code, before) => {
      expect(ruff(code, before)).toBe(before);
    },
  );
  it.each(UNPROMOTED)('does not apply the unsafe fix of %s on its own', (code, before) => {
    expect(ruff(code, before)).toBe(before);
  });
  it.each(UNPROMOTED)(
    'applies the reviewed fix of %s only as an unsafe fix',
    (code, before, after) => {
      expect(ruff(code, before, ['--unsafe-fixes'])).toBe(after);
    },
  );
});

describe('promoted and review rules', () => {
  it('keeps the promoted rules out of the review rules', () => {
    const config = readFileSync(RUFF_CONFIG, 'utf8');
    const block = config.match(/extend-safe-fixes = \[([^\]]*)\]/u)[1];
    const promoted = [...block.matchAll(/"([A-Z]+\d+)"/gu)].map((match) => match[1]);
    expect(promoted).toEqual(
      PROMOTED.map(([code]) => code).toSorted((left, right) => left.localeCompare(right)),
    );
    expect(REVIEW_CODES.filter((code) => promoted.includes(code))).toEqual([]);
    expect(MOVED_TO_REVIEW.filter(([code]) => !REVIEW_CODES.includes(code))).toEqual([]);
    expect(promoted.filter((code) => DROPS_COMMENTS.some(([dropped]) => dropped === code))).toEqual(
      [],
    );
  });
  it('picks the review codes out of the selected rules', () => {
    expect(
      reviewCodesSelected(['ruff/T201', 'ruff/E712', 'ruff/F401', 'java/UpperEll', 'ruff/T201']),
    ).toEqual(['E712', 'T201']);
    expect(reviewCodesSelected([])).toEqual([]);
    expect(reviewCodesSelected()).toEqual([]);
  });
});

function topic(source) {
  const repository = createGitRepository(
    { 'pyproject.toml': PYPROJECT, 'a.py': 'a = 1\n' },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { 'a.py': source });
  return repository;
}

function fix(repository, tools, selectedRules) {
  return fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: tools.executeFixCommand,
    headPolicy: { exclude: [], conventions: {} },
    config: { preset: 'python' },
    selectedRules,
  });
}

describe('--fix with reviewed ruff rules', () => {
  it('runs only the safe pass when no review rule is selected', () => {
    const repository = topic('x = 1\n');
    const tools = fakePythonTools();

    fix(repository, tools, ['ruff/F401']);

    expect(tools.callsOf('ruff-fix')).toHaveLength(1);
    expect(tools.callsOf('ruff-fix')[0].args).not.toContain('--unsafe-fixes');
  });
  it('adds an unsafe pass limited to the selected review rules', () => {
    const repository = topic('x = 1\n');
    const tools = fakePythonTools();

    fix(repository, tools, ['ruff/T201', 'ruff/E712', 'ruff/F401']);

    const [safe, review] = tools.callsOf('ruff-fix');
    expect(safe.args.includes('--unsafe-fixes')).toBe(false);
    expect(review.args.includes('--unsafe-fixes')).toBe(true);
    expect(
      review.args.slice(review.args.indexOf('--select'), review.args.indexOf('--select') + 2),
    ).toEqual(['--select', 'E712,T201']);
    expect(review.args.slice(-2)).toEqual(['--stdin-filename=a.py', '-']);
  });
  it('feeds the output of the safe pass into the review pass and writes the result', () => {
    const repository = topic('v = x == True\n');
    const tools = fakePythonTools({
      lintEdit: (_file, source) => {
        const unsafe = tools.calls.at(-1).args.includes('--unsafe-fixes');
        return unsafe ? source.replace('x == True', 'x') : source.replace('v =', 'w =');
      },
    });

    const result = fix(repository, tools, ['ruff/E712']);

    expect(readFileSync(path.join(repository.root, 'a.py'), 'utf8')).toBe('w = x\n');
    expect(result.fixedFiles).toEqual(['a.py']);
  });
});
