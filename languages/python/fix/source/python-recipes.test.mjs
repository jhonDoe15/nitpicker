import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRecipes } from './test-support/apply-recipes.mjs';

const CASES = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/cases.json'), 'utf8'),
);

const REWRITES = [
  [
    'python-exc-info',
    undefined,
    'app/load.py',
    'import logging\n\nlog = logging.getLogger(__name__)\n\n\ndef load(path):\n    try:\n        return open(path).read()\n    except OSError as error:\n        log.warning("cannot read %s: %s", path, error, exc_info=True)\n        raise RuntimeError("unreadable") from None\n',
  ],
  [
    'python-falsy-default',
    'python-rules/falsy-default',
    'app/title.py',
    'def title(name: str | None = None, tags: list[str] | None = None):\n    label = name if name is not None else "untitled"\n    items = tags if tags is not None else ["a"]\n    return label, items\n',
  ],
  [
    'python-frozen-dataclass',
    'python-rules/frozen-dataclass',
    'app/point.py',
    'from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Point:\n    x: int\n    y: int\n\n\n@dataclass(order=True, frozen=True)\nclass Ordered:\n    rank: int\n',
  ],
  [
    'python-http-timeout',
    'python-rules/http-without-timeout',
    'app/client.py',
    'import requests\n\n\ndef fetch(url):\n    session = requests.Session()\n    first = session.get(url, timeout=10)\n    second = session.post(url, timeout=10)\n    return first, second\n',
  ],
  [
    'python-shell-arguments',
    'python-rules/shell-command',
    'app/run.py',
    'import subprocess\n\n\ndef build():\n    subprocess.run(["make", "-j4", "all"], check=True)\n',
  ],
  [
    'python-tls-verification',
    'python-rules/tls-verification-off',
    'app/secure.py',
    'import requests\n\n\ndef fetch(url):\n    session = requests.Session()\n    return session.get(url, timeout=5)\n',
  ],
  [
    'python-safe-load',
    'python-rules/unsafe-deserialization',
    'app/config.py',
    'import yaml\n\n\ndef read(stream):\n    return yaml.safe_load(stream)\n',
  ],
  [
    'python-mutmut-pragma',
    'mutmut/mutant-ignored',
    'app/core.py',
    'LIMIT = 10\n\n\ndef clamp(value):\n    return min(value, LIMIT)\n',
  ],
];

describe('Python source recipes', () => {
  it.each(REWRITES)('%s rewrites the fixture', (recipe, rule, name, expected) => {
    const { read } = applyRecipes(CASES[recipe], {
      selectedRules: rule === undefined ? [] : [rule],
    });

    expect(read(name)).toBe(expected);
  });

  it('lists the fixed finding of the safe recipe', () => {
    const { outcome } = applyRecipes(CASES['python-exc-info']);

    expect(outcome.fixedFindings).toEqual([
      'app/load.py:10 python-rules/catch-log-without-exception (python-exc-info)',
    ]);
  });

  it('leaves review recipes alone until their rule is selected', () => {
    const { read } = applyRecipes(CASES['python-safe-load']);

    expect(read('app/config.py')).toBe(CASES['python-safe-load']['app/config.py']);
  });

  it('renames an uncollected test file to the collected pattern', () => {
    const { exists, read, outcome } = applyRecipes(CASES['python-collected-test-name'], {
      selectedRules: ['python-rules/uncollected-tests'],
    });

    expect([
      exists('tests/check_math.py'),
      read('tests/test_check_math.py'),
      outcome.files,
    ]).toEqual([
      false,
      'def test_add():\n    assert 1 + 1 == 2\n',
      [{ path: 'tests/test_check_math.py' }],
    ]);
  });
});
