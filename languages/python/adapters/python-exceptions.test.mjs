import { describe, expect, it } from 'vitest';
import { applyPythonExceptions } from './python-exceptions.mjs';

const finding = (rule, path) => ({ tool: 'ruff', rule, path, identity: rule });
const exception = (rule, paths) => ({ rule, paths, reason: 'because' });

describe('python exceptions', () => {
  const findings = [
    finding('T201', 'scripts/run.py'),
    finding('T201', 'src/app.py'),
    finding('PTH118', 'scripts/run.py'),
  ];

  it('keeps everything without exceptions', () => {
    expect(applyPythonExceptions(findings)).toEqual(findings);
    expect(applyPythonExceptions(findings, [])).toEqual(findings);
  });

  it('lifts one rule for the matching paths only', () => {
    expect(applyPythonExceptions(findings, [exception('T201', ['scripts/**'])])).toEqual([
      findings[1],
      findings[2],
    ]);
  });

  it('matches any of the globs and any of the entries', () => {
    const exceptions = [exception('T201', ['nothing/**', 'src/*.py']), exception('PTH118', ['**'])];

    expect(applyPythonExceptions(findings, exceptions)).toEqual([findings[0]]);
  });

  it('lets a ruff prefix cover the codes under it', () => {
    expect(applyPythonExceptions(findings, [exception('PTH', ['**'])])).toEqual([
      findings[0],
      findings[1],
    ]);
    expect(applyPythonExceptions(findings, [exception('T', ['**'])])).toEqual([findings[2]]);
  });

  it('lifts a function-scoped rule only inside the named function', () => {
    const at = (symbol) => ({
      tool: 'coverage-py',
      rule: 'changed-branch-coverage',
      path: 'src/store.py',
      identity: symbol ?? 'none',
      symbol,
    });
    const scoped = [at('Store.save'), at('Store.load'), at('save_all'), at(undefined)];
    const lifted = {
      rule: 'changed-branch-coverage',
      paths: ['src/**'],
      function: 'save',
      reason: 'because',
    };

    expect(applyPythonExceptions(scoped, [lifted])).toEqual([scoped[1], scoped[2], scoped[3]]);
    expect(applyPythonExceptions(scoped, [{ ...lifted, function: 'Store.load' }])).toEqual([
      scoped[0],
      scoped[2],
      scoped[3],
    ]);
  });

  it('needs the other tools to name the rule exactly', () => {
    const mypy = { tool: 'mypy', rule: 'arg-type', path: 'src/a.py', identity: 'x' };
    const rules = {
      tool: 'python-rules',
      rule: 'frozen-dataclass',
      path: 'src/a.py',
      identity: 'y',
    };

    expect(applyPythonExceptions([mypy, rules], [exception('arg', ['**'])])).toEqual([mypy, rules]);
    expect(applyPythonExceptions([mypy, rules], [exception('frozen-dataclass', ['**'])])).toEqual([
      mypy,
    ]);
  });
});
