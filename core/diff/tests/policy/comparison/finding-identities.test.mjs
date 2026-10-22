import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../comparison/compare.mjs';
import { parseFinding } from '../../../comparison/finding-schema.mjs';
import { canonicalCycleIdentity } from '../../../comparison/fingerprint.mjs';
import { finding } from '../../../execution/test-support/analyzer-findings.mjs';

describe('quality diff finding identities', () => {
  it('canonicalizes equivalent cycle traversal order', () => {
    const first = canonicalCycleIdentity([
      { source: 'src/a.ts', target: 'src/b.ts' },
      { source: 'src/b.ts', target: 'src/c.ts' },
      { source: 'src/c.ts', target: 'src/a.ts' },
    ]);
    const second = canonicalCycleIdentity([
      { source: './src/c.ts', target: './src/a.ts' },
      { source: './src/a.ts', target: './src/b.ts' },
      { source: './src/b.ts', target: './src/c.ts' },
    ]);

    expect(first).toBe(second);
  });
  it('keeps a feature finding when its importer is renamed and the target feature folder moves', () => {
    const base = finding({
      tool: 'coupling',
      rule: 'feature-cycle',
      path: 'src/features/billing/invoice.py',
      identity: 'src/features/shipping|feature-cycle',
    });
    const head = {
      ...base,
      path: 'src/features/billing/documents/invoice.py',
      identity: 'src/modules/shipping|feature-cycle',
    };

    const comparison = compareFindings({
      baseFindings: [base],
      headFindings: [head],
      baseToHeadRenames: new Map([
        ['src/features/billing/invoice.py', 'src/features/billing/documents/invoice.py'],
      ]),
      baseToHeadDirectories: new Map([['src/features/shipping', 'src/modules/shipping']]),
    });

    expect(comparison.newFindings).toEqual([]);
    expect(comparison.unchangedFindings).toHaveLength(1);
  });
  it('does not match different metric names under one descriptive identity', () => {
    const base = finding({
      path: 'src/main/fixture.ts',
      classification: 'descriptive',
      metric: { name: 'fanIn', value: 2 },
    });
    const head = { ...base, metric: { name: 'fanOut', value: 2 } };

    const comparison = compareFindings({
      baseFindings: [base],
      headFindings: [head],
    });

    expect(comparison.changedMetrics).toEqual([]);
    expect(comparison.newFindings).toHaveLength(1);
    expect(comparison.resolvedFindings).toHaveLength(1);
  });
  it('rejects analyzer paths outside the analyzed project', () => {
    expect(() => parseFinding(finding({ path: '../outside.ts' }))).toThrow(
      /must stay within the analyzed project/,
    );
  });
});
