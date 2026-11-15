import { describe, expect, it } from 'vitest';
import {
  skipPlanOf,
  carryBaseReports,
  endsEarly,
  runUnlessSkipped,
  withoutSkipped,
} from './apply.mjs';

const analyzers = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
const settled = { policyChanges: [], policyLoosenings: [] };

describe('carryBaseReports', () => {
  it('shows the cached base findings of a skipped analyzer as its head findings too', () => {
    const report = { findings: [{ rule: 'old' }] };
    const baseRun = { reports: new Map([['b', report]]) };
    const headRun = { reports: new Map([['a', { findings: [] }]]), toolErrors: [] };

    const result = carryBaseReports({
      analyzers,
      baseRun,
      headRun,
      skipPlan: { skipped: ['b', 'c'], affected: ['a'] },
    });

    expect(result.headRun.reports.get('b')).toBe(report);
    expect(result.analyzers.map(({ name }) => name)).toEqual(['a', 'b']);
  });
});

describe('endsEarly', () => {
  const none = { skipped: ['a'], affected: [] };

  it('ends the run when no analyzer is affected and the policy did not change', () => {
    expect(endsEarly(none, settled)).toBe(true);
  });

  it('keeps running when a policy change or loosening was found', () => {
    expect(endsEarly(none, { ...settled, policyChanges: [{}] })).toBe(false);
    expect(endsEarly(none, { ...settled, policyLoosenings: [{}] })).toBe(false);
  });

  it('keeps running when there is no analyzer to name', () => {
    expect(endsEarly({ skipped: [], affected: [] }, settled)).toBe(false);
  });

  it('keeps running when an analyzer is affected', () => {
    expect(endsEarly({ skipped: [], affected: ['a'] }, settled)).toBe(false);
  });
});

describe('runUnlessSkipped', () => {
  it('runs only the analyzers that are not skipped and never runs an empty list', () => {
    const skipPlan = { skipped: ['b'] };
    const ran = [];

    runUnlessSkipped(analyzers, skipPlan, (list) => ran.push(list.map(({ name }) => name)));
    const empty = runUnlessSkipped([{ name: 'b' }], skipPlan, () => ran.push('unexpected'));

    expect(withoutSkipped(analyzers, skipPlan)).toHaveLength(2);
    expect(ran).toEqual([['a', 'c']]);
    expect(empty.reports.size).toBe(0);
  });
});

describe('skipPlanOf', () => {
  it('skips nothing in a shard run, so every shard reports every analyzer it was given', () => {
    const settings = { sharded: true, analyzers: [{ name: 'a' }, { name: 'b' }] };

    expect(skipPlanOf(settings, {})).toEqual({ skipped: [], affected: ['a', 'b'] });
  });

  it('skips nothing when config-file overrides are set', () => {
    const settings = { configOverrides: ['x'], analyzers: [{ name: 'a' }] };

    expect(skipPlanOf(settings, {})).toEqual({ skipped: [], affected: ['a'] });
  });
});
