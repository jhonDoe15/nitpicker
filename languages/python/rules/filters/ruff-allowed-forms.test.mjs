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
