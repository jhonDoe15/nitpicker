import { describe, expect, it } from 'vitest';
import type { AnalyzerRun } from '../execution/run-analyzers.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import {
  skipPlanOf,
  carryBaseReports,
  endsEarly,
  runUnlessSkipped,
  withoutSkipped,
} from './apply.mts';

const analyzers = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
const unrooted = { repositoryRoot: '', headPolicy: undefined, headProjectRoot: '' };
const noSnapshots = { mergeBaseSha: '', headSha: '' };
const idle: AnalyzerRun = {
  reports: new Map(),
  timings: new Map(),
  toolErrors: [],
  skipped: new Map(),
  metadata: new Map(),
};

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

    const reports = fieldOf(result.headRun, 'reports');
    expect(reports instanceof Map ? reports.get('b') : undefined).toBe(report);
    expect(result.analyzers.map((analyzer) => fieldOf(analyzer, 'name'))).toEqual(['a', 'b']);
  });
});

describe('endsEarly', () => {
  const none = { skipped: ['a'], affected: [] };

  it('ends the run when no analyzer is affected', () => {
    expect(endsEarly(none)).toBe(true);
  });

  it('keeps running when there is no analyzer to name', () => {
    expect(endsEarly({ skipped: [], affected: [] })).toBe(false);
  });

  it('keeps running when an analyzer is affected', () => {
    expect(endsEarly({ skipped: [], affected: ['a'] })).toBe(false);
  });
});

describe('runUnlessSkipped', () => {
  it('runs only the analyzers that are not skipped and never runs an empty list', () => {
    const skipPlan = { skipped: ['b'], affected: [] };
    const ran: unknown[] = [];

    runUnlessSkipped(analyzers, skipPlan, (list) => {
      ran.push(list.map((analyzer) => fieldOf(analyzer, 'name')));
      return idle;
    });
    const empty = runUnlessSkipped([{ name: 'b' }], skipPlan, () => {
      ran.push('unexpected');
      return idle;
    });

    expect(withoutSkipped(analyzers, skipPlan)).toHaveLength(2);
    expect(ran).toEqual([['a', 'c']]);
    expect(empty.reports.size).toBe(0);
  });
});

describe('skipPlanOf', () => {
  it('skips nothing in a shard run, so every shard reports every analyzer it was given', () => {
    const settings = { ...unrooted, sharded: true, analyzers: [{ name: 'a' }, { name: 'b' }] };

    expect(skipPlanOf(settings, noSnapshots)).toEqual({ skipped: [], affected: ['a', 'b'] });
  });

  it('skips nothing when config-file overrides are set', () => {
    const settings = { ...unrooted, configOverrides: ['x'], analyzers: [{ name: 'a' }] };

    expect(skipPlanOf(settings, noSnapshots)).toEqual({ skipped: [], affected: ['a'] });
  });
});
