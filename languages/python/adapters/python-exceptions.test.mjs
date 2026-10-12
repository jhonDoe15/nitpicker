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

  it('needs the rule to be the same, not a prefix of it', () => {
    expect(applyPythonExceptions(findings, [exception('PTH', ['**'])])).toEqual(findings);
  });
});
