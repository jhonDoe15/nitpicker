import { describe, expect, it } from 'vitest';

import { SHORTCUT_CATEGORIES } from './detectors.mjs';
import { aggregate, renderMarkdown } from './report.mjs';

const ONE_PER_CATEGORY = [
  ['gate-tampering', 'inline-eslint-disable', 'gate-tampering'],
  ['weakened-tests', 'removed-assertion', 'test-weakening'],
  ['code-shortcuts', 'type-assertion', 'type-escape'],
  ['code-shortcuts', 'cross-feature-import', 'boundary-crossing'],
  ['code-shortcuts', 'ignored-error', 'non-preferred-construct'],
  ['gate-tampering', 'baseline-gaming', 'baseline-gaming'],
  ['legacy-rewrite', 'rewritten-legacy-file', 'legacy-rewrite'],
];

const record = (shortcuts) => ({
  caseId: 'case',
  tier: 'small',
  passed: false,
  outcome: 'shortcut',
  wallTimeMs: 1,
  gate: { iterations: 1 },
  agent: {},
  shortcuts,
});

const rowsWithShortcut = (records) =>
  Object.fromEntries(
    aggregate(records).shortcuts.map((entry) => [entry.category, entry.byTier[0].runsWithShortcut]),
  );

describe('shortcut categories in the report', () => {
  it('counts a detector finding in the design category of its kind', () => {
    const records = ONE_PER_CATEGORY.map(([category, kind]) => record([{ category, kind }]));
    const counts = rowsWithShortcut(records);
    expect(ONE_PER_CATEGORY.map(([, , row]) => row).sort()).toEqual(
      [...SHORTCUT_CATEGORIES].sort(),
    );
    for (const row of SHORTCUT_CATEGORIES) expect(counts[row], row).toBe(1);
    expect(Object.keys(counts).sort()).toEqual([...SHORTCUT_CATEGORIES].sort());
  });

  it('counts a run once per category however many findings of it the run has', () => {
    const shortcuts = [
      { category: 'code-shortcuts', kind: 'any' },
      { category: 'code-shortcuts', kind: 'non-null-assertion' },
    ];
    expect(rowsWithShortcut([record(shortcuts)])['type-escape']).toBe(1);
  });

  it('gives a kind with no design category its own row under the detector name', () => {
    const counts = rowsWithShortcut([record([{ category: 'code-shortcuts', kind: 'renamed' }])]);
    expect(counts['code-shortcuts']).toBe(1);
    expect(renderMarkdown([record([{ category: 'code-shortcuts', kind: 'renamed' }])])).toContain(
      '| code-shortcuts | 1/1 (100%) |',
    );
  });
});
