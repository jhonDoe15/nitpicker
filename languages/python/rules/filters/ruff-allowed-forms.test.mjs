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

  it.each(['ARG001', 'FBT001', 'PLR2004', 'S105', 'S311'])(
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

  it.each(['S501', 'S113', 'S324'])('drop %s in test support folders and conftest.py', (rule) => {
    const support = ['src/app/test_support/a.py', 'mocks/a.py', 'conftest.py', 'fixtures/a.py'];

    expect(withoutAllowedForms(support.map((path) => inFile(rule, path)))).toEqual([]);
  });

  it('keep other rules there and security rules in production code', () => {
    const kept = [inFile('ARG001', 'mocks/a.py'), inFile('S501', 'src/app/client.py')];

    expect(withoutAllowedForms(kept)).toEqual(kept);
  });
});

describe('hash classes inside an HMAC', () => {
  const s303 = (line, column) => ({
    ...finding('S303', 'Use of insecure MD2, MD4, MD5, or SHA1 hash function'),
    path: 'a.py',
    location: { line, column },
  });
  const lines = {
    1: '    signer = crypto_hmac.HMAC(key, hashes.SHA1())',
    2: '    signer = hmac.HMAC(',
    3: '        key,',
    4: '        hashes.SHA1(),',
    5: '    )',
    6: '    digest = hashes.Hash(hashes.SHA1())',
    7: '    hashes.MD5()',
  };
  const lineOf = (_path, line) => lines[line];

  it.each([
    [1, 36],
    [4, 9],
  ])('drop the finding on line %s, which names the HMAC hash', (line, column) => {
    expect(withoutAllowedForms([s303(line, column)], { lineOf })).toEqual([]);
  });

  it.each([
    [6, 26],
    [7, 5],
  ])('keep the finding on line %s, which is no HMAC', (line, column) => {
    expect(withoutAllowedForms([s303(line, column)], { lineOf })).toEqual([s303(line, column)]);
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
