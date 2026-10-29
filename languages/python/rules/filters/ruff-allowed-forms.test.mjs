import { describe, expect, it } from 'vitest';
import { withoutAllowedForms } from './ruff-allowed-forms.mjs';

const finding = (rule, message, tool = 'ruff') => ({ tool, rule, message });
const magic = (value) =>
  finding(
    'PLR2004',
    `Magic value used in comparison, consider replacing \`${value}\` with a constant variable`,
  );

describe('magic numbers', () => {
  it.each(['-1', '0', '1', '2', '10', '100', '1000', '1_000', '0.0', '10.0', '1e3'])(
    'allow %s',
    (value) => {
      expect(withoutAllowedForms([magic(value)])).toEqual([]);
    },
  );

  it.each(['3', '7.5', '-2', '1001', '"text"'])('keep %s', (value) => {
    expect(withoutAllowedForms([magic(value)])).toEqual([magic(value)]);
  });

  it('keep a message that names no value', () => {
    const odd = finding('PLR2004', 'Magic value');

    expect(withoutAllowedForms([odd])).toEqual([odd]);
  });
});

describe('shell commands', () => {
  const fixed =
    'Starting a process with a shell: seems safe, but may be changed in the future; consider rewriting without `shell`';
  const risky = 'Starting a process with a shell, possible injection detected, security issue.';

  it.each(['S602', 'S604', 'S605'])(
    'allow a fixed command for %s and keep an injectable one',
    (rule) => {
      expect(withoutAllowedForms([finding(rule, fixed), finding(rule, risky)])).toEqual([
        finding(rule, risky),
      ]);
    },
  );

  it('keep the fixed-command message of another rule', () => {
    const other = finding('S609', fixed);

    expect(withoutAllowedForms([other])).toEqual([other]);
  });
});

describe('test files', () => {
  const inFile = (rule, path) => ({ ...finding(rule, 'm'), path });

  it.each(['ARG001', 'FBT001', 'PLR2004', 'S105', 'S311', 'ASYNC251'])(
    'drop %s in a file the project runs as tests',
    (rule) => {
      expect(
        withoutAllowedForms([inFile(rule, 'qa/check_a.py')], { testFiles: ['qa/check_a.py'] }),
      ).toEqual([]);
    },
  );

  it('keep them in other files and keep other rules in test files', () => {
    const kept = [inFile('ARG001', 'src/a.py'), inFile('F401', 'qa/check_a.py')];

    expect(withoutAllowedForms(kept, { testFiles: ['qa/check_a.py'] })).toEqual(kept);
  });
});

describe('test support', () => {
  const inFile = (rule, path) => ({ ...finding(rule, 'm'), path });
  const supportFiles = ['qa/servers/fake_tls.py', 'conftest.py'];

  it.each(['S501', 'S113', 'S324'])(
    'drop %s in the support files the rules script listed',
    (rule) => {
      const found = supportFiles.map((path) => inFile(rule, path));

      expect(withoutAllowedForms(found, { supportFiles })).toEqual([]);
    },
  );

  it('keep other rules there and security rules in production support folders', () => {
    const kept = [inFile('ARG001', 'conftest.py'), inFile('S501', 'shop/testing/ab_variants.py')];

    expect(withoutAllowedForms(kept, { supportFiles })).toEqual(kept);
  });
});

describe('sites the rules script allowed', () => {
  const at = (rule, line) => ({
    ...finding(rule, 'm'),
    path: 'a.py',
    location: { line, column: 5 },
  });
  const allowed = [
    { rule: 'S303', path: 'a.py', line: 4 },
    { rule: 'S506', path: 'a.py', line: 9 },
  ];

  it.each([
    ['S303', 4],
    ['S506', 9],
  ])('drop %s on line %s', (rule, line) => {
    expect(withoutAllowedForms([at(rule, line)], { allowed })).toEqual([]);
  });

  it.each([
    ['S303', 6],
    ['S506', 4],
    ['S324', 4],
  ])('keep %s on line %s', (rule, line) => {
    expect(withoutAllowedForms([at(rule, line)], { allowed })).toEqual([at(rule, line)]);
  });

  it('keep a site in another file', () => {
    const other = { ...at('S303', 4), path: 'b.py' };

    expect(withoutAllowedForms([other], { allowed })).toEqual([other]);
  });

  it.each([
    ['DTZ005', 'clock-now'],
    ['DTZ011', 'real-clock-in-test'],
    ['ASYNC110', 'sleep-in-test'],
    ['PLW1508', 'process-env-access'],
    ['PLW0129', 'tautological-assert'],
  ])('drop %s on a line where %s still reports', (rule, owner) => {
    const owned = [{ rule, path: 'a.py', line: 7, owner }];
    const keepsOwner = (site) => site.owner === owner;

    expect(withoutAllowedForms([at(rule, 7), at(rule, 8)], { allowed: owned, keepsOwner })).toEqual(
      [at(rule, 8)],
    );
  });

  it.each([
    ['DTZ005', 'clock-now'],
    ['ASYNC110', 'sleep-in-test'],
  ])('keep %s when an exception lifts its owner %s', (rule, owner) => {
    const owned = [{ rule, path: 'a.py', line: 7, owner }];

    expect(withoutAllowedForms([at(rule, 7)], { allowed: owned, keepsOwner: () => false })).toEqual(
      [at(rule, 7)],
    );
  });

  it('drop a site without an owner whatever the exceptions say', () => {
    expect(withoutAllowedForms([at('S303', 4)], { allowed, keepsOwner: () => false })).toEqual([]);
  });
});

describe('ruff rules that overlap on one line', () => {
  const at = (rule, line) => ({
    ...finding(rule, 'm'),
    path: 'a.py',
    location: { line, column: 1 },
  });

  it.each([
    ['LOG015', 'G010'],
    ['ASYNC230', 'PTH123'],
    ['ASYNC240', 'PTH110'],
    ['PLE0115', 'PLW0602'],
    ['PLE0115', 'PLW0603'],
  ])('keep %s and drop %s on its line', (owner, owned) => {
    expect(withoutAllowedForms([at(owner, 3), at(owned, 3)])).toEqual([at(owner, 3)]);
  });

  it('keep G010 on another line', () => {
    expect(withoutAllowedForms([at('LOG015', 3), at('G010', 4)])).toEqual([
      at('LOG015', 3),
      at('G010', 4),
    ]);
  });

  it('keep G010 when an exception lifts LOG015', () => {
    expect(
      withoutAllowedForms([at('LOG015', 3), at('G010', 3)], {
        keepsOwner: ({ owner }) => owner !== 'LOG015',
      }),
    ).toEqual([at('LOG015', 3), at('G010', 3)]);
  });
});

describe('comment labels', () => {
  const era = (line) => ({
    ...finding('ERA001', 'Found commented-out code'),
    path: 'a.py',
    location: { line },
  });
  const lines = {
    1: '# Raises: ValueError',
    2: '    # Shape: (batch, channels)',
    3: '# e.g. foo(bar)',
    4: '# Example: compute([1, 2]) == 3',
    5: '# total = compute(1)',
    6: '# x: int = 3',
  };
  const lineOf = (_path, line) => lines[line];

  it.each([1, 2, 3, 4])('allow the label on line %s', (line) => {
    expect(withoutAllowedForms([era(line)], { lineOf })).toEqual([]);
  });

  it.each([5, 6])('keep the code on line %s', (line) => {
    expect(withoutAllowedForms([era(line)], { lineOf })).toEqual([era(line)]);
  });
});

describe('other findings', () => {
  it('stay untouched, including those of other tools', () => {
    const rest = [
      finding('F401', 'unused'),
      finding('PLR2004', 'replacing `0` with a constant', 'mypy'),
      finding('python-rules', 'x', 'python-rules'),
    ];

    expect(withoutAllowedForms(rest)).toEqual(rest);
  });
});
