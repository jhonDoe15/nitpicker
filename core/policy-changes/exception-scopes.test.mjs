import { describe, expect, it } from 'vitest';
import { describePolicyChanges } from './describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from './policy-scope.mjs';

function changes(baseConfig, headConfig, files) {
  return describePolicyChanges(
    baseConfig,
    headConfig,
    createPolicyScope({
      files,
      baseFiles: files,
      baseRoots: rootSets(baseConfig, '.'),
      headRoots: rootSets(headConfig, '.'),
      headConfig,
    }),
  );
}

function loosened(baseConfig, headConfig, files) {
  return changes(baseConfig, headConfig, files).loosened;
}

describe('an exception that names a function or a declaration', () => {
  const FILE = ['src/a.ts'];
  const entry = (extra = {}) => ({
    rule: 'function-lines-limit',
    paths: FILE,
    reason: 'Legacy',
    ...extra,
  });
  const python = (exceptions) => ({
    preset: 'python',
    python: { sourceRoots: ['src'], exceptions },
  });

  it('counts widening a narrow entry to the whole file', () => {
    expect(
      loosened({ exceptions: [entry({ function: 'f' })] }, { exceptions: [entry()] }, FILE),
    ).toEqual(['exception added: function-lines-limit for src/a.ts (Legacy)']);
    expect(
      loosened(
        { exceptions: [entry({ rule: 'exports', name: 'x' })] },
        { exceptions: [entry({ rule: 'exports' })] },
        FILE,
      ),
    ).toEqual(['exception added: exports for src/a.ts (Legacy)']);
  });

  it('counts naming another function than the one the base accepted', () => {
    expect(
      loosened(
        { exceptions: [entry({ function: 'f' })] },
        { exceptions: [entry({ function: 'g' })] },
        FILE,
      ),
    ).toEqual(['exception added: function-lines-limit function g for src/a.ts (Legacy)']);
  });

  it('counts a new narrow entry next to an existing one for the same file', () => {
    expect(
      loosened(
        { exceptions: [entry({ function: 'f' })] },
        { exceptions: [entry({ function: 'f' }), entry({ function: 'g' })] },
        FILE,
      ),
    ).toEqual(['exception added: function-lines-limit function g for src/a.ts (Legacy)']);
  });

  it('does not count narrowing a whole-file entry, or keeping the same function', () => {
    expect(
      loosened({ exceptions: [entry()] }, { exceptions: [entry({ function: 'f' })] }, FILE),
    ).toEqual([]);
    expect(
      loosened(
        { exceptions: [entry({ function: 'f(a, b)' })] },
        { exceptions: [entry({ function: 'f' })] },
        FILE,
      ),
    ).toEqual([]);
  });

  it('lists the narrow entry that was removed', () => {
    expect(
      changes({ exceptions: [entry({ function: 'f' })] }, { exceptions: [] }, FILE).changed,
    ).toEqual(['exception removed: function-lines-limit function f for src/a.ts']);
  });

  it('applies the same rules to python.exceptions', () => {
    const files = ['src/a.py'];
    const pythonEntry = (extra = {}) => entry({ rule: 'ruff-rule', paths: files, ...extra });

    expect(
      loosened(
        python([pythonEntry({ function: 'f' })]),
        python([pythonEntry({ function: 'g' })]),
        files,
      ),
    ).toEqual(['exception added: ruff-rule function g for src/a.py (Legacy)']);
    expect(
      loosened(python([pythonEntry({ function: 'f' })]), python([pythonEntry()]), files),
    ).toEqual(['exception added: ruff-rule for src/a.py (Legacy)']);
  });
});
