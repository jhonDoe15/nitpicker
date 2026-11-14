import { describe, expect, it } from 'vitest';
import { applyRecipes } from './test-support/apply-recipes.mjs';

const BOM = String.fromCharCode(0xfeff);
const FALSY = ['python-rules/falsy-default'];

function defaulted(lines, eol = '\n') {
  return `${lines.join(eol)}${eol}`;
}

describe('Python source recipes keep offsets exact', () => {
  it('counts UTF-16 units for text before the fix', () => {
    const source = defaulted([
      'NOTE = "😀é"',
      '',
      '',
      'def f(name: str | None = None):',
      '    note = "😀é"; value = name or "ü😀"',
      '    return note, value',
    ]);

    const { read } = applyRecipes({ 'app/a.py': source }, { selectedRules: FALSY });

    expect(read('app/a.py')).toBe(
      defaulted([
        'NOTE = "😀é"',
        '',
        '',
        'def f(name: str | None = None):',
        '    note = "😀é"; value = name if name is not None else "ü😀"',
        '    return note, value',
      ]),
    );
  });

  it('keeps CRLF line endings', () => {
    const source = defaulted(
      ['def f(name: str | None = None):', '    value = name or "x"', '    return value'],
      '\r\n',
    );

    const { read } = applyRecipes({ 'app/a.py': source }, { selectedRules: FALSY });

    expect(read('app/a.py')).toBe(
      defaulted(
        [
          'def f(name: str | None = None):',
          '    value = name if name is not None else "x"',
          '    return value',
        ],
        '\r\n',
      ),
    );
  });

  it('reads past a byte order mark', () => {
    const source = `${BOM}${defaulted(['def f(name: str | None = None):', '    return name or "x"'])}`;

    const { read } = applyRecipes({ 'app/a.py': source }, { selectedRules: FALSY });

    expect(read('app/a.py')).toBe(
      `${BOM}${defaulted(['def f(name: str | None = None):', '    return name if name is not None else "x"'])}`,
    );
  });
});

describe('Python source recipes decline what they cannot prove', () => {
  it('declines a log call that spreads keywords', () => {
    const source = defaulted([
      'import logging',
      '',
      'log = logging.getLogger(__name__)',
      '',
      '',
      'def f(path, extra):',
      '    try:',
      '        return open(path).read()',
      '    except OSError as error:',
      '        log.warning("cannot read %s", error, **extra)',
      '        raise RuntimeError("unreadable") from None',
    ]);

    const { read, outcome } = applyRecipes({ 'app/a.py': source });

    expect(read('app/a.py')).toBe(source);
    expect(outcome.notes).toEqual([
      '--fix left app/a.py:10 catch-log-without-exception as is: the call spreads arguments or already names exc_info',
    ]);
  });

  it('declines a frozen dataclass whose method assigns to self', () => {
    const source = defaulted([
      'from dataclasses import dataclass',
      '',
      '',
      '@dataclass',
      'class Counter:',
      '    total: int',
      '',
      '    def add(self, amount):',
      '        self.total += amount',
    ]);

    const { read, outcome } = applyRecipes(
      { 'app/a.py': source },
      { selectedRules: ['python-rules/frozen-dataclass'] },
    );

    expect(read('app/a.py')).toBe(source);
    expect(outcome.notes).toEqual([
      '--fix left app/a.py:5 frozen-dataclass as is: a method assigns to self',
    ]);
  });

  it('declines a shell command with shell syntax', () => {
    const source = defaulted([
      'import subprocess',
      '',
      '',
      'def f():',
      '    subprocess.run(["bash", "-c", "make | tee log"])',
    ]);

    const { read, outcome } = applyRecipes(
      { 'app/a.py': source },
      { selectedRules: ['python-rules/shell-command'] },
    );

    expect(read('app/a.py')).toBe(source);
    expect(outcome.notes).toEqual([
      '--fix left app/a.py:5 shell-command as is: the command uses shell syntax',
    ]);
  });

  it('declines a default inside a larger expression', () => {
    const source = defaulted(['def f(name: str | None = None):', '    return (name or "x", 1)']);

    const { read } = applyRecipes({ 'app/a.py': source }, { selectedRules: FALSY });

    expect(read('app/a.py')).toBe(source);
  });

  it('declines a rename when the collected name exists', () => {
    const files = {
      'tests/check_math.py': 'def test_add():\n    assert True\n',
      'tests/test_check_math.py': 'x = 1\n',
    };

    const { exists, outcome } = applyRecipes(files, {
      selectedRules: ['python-rules/uncollected-tests'],
    });

    expect(exists('tests/check_math.py')).toBe(true);
    expect(outcome.notes).toEqual([
      '--fix left 1 uncollected-tests file(s) as is: the new name exists',
    ]);
  });
});
