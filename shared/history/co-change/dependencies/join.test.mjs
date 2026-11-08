import { describe, expect, it } from 'vitest';
import { coChangeFindings, CO_CHANGE_ADVICE } from '../findings.mjs';
import { withCoChangeDependencies } from './join.mjs';

const PAIR = {
  first: 'src/billing',
  second: 'src/invoicing',
  firstCommits: 10,
  secondCommits: 12,
  support: 8,
  confidence: 0.8,
  examples: ['a'.repeat(40)],
};

function historyReport(pair = PAIR) {
  return { findings: coChangeFindings({ pairs: [pair], used: 50 }) };
}

function publisher(moduleImports) {
  return { findings: [], moduleImports };
}

function sentenceOf(run) {
  const [finding] = run.reports.get('change-history').findings;
  return finding.message.split(CO_CHANGE_ADVICE)[0].split('). ').at(-1).trim();
}

function joined(reports, policy) {
  return withCoChangeDependencies({ reports: new Map(Object.entries(reports)) }, policy);
}

describe('co-change dependencies', () => {
  it('names the direction and the number of importing files', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([{ from: 'src/billing', to: 'src/invoicing', files: 3 }]),
    });

    expect(sentenceOf(run)).toBe('src/billing imports src/invoicing in 3 files.');
  });
  it('names both directions when the modules import each other', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([
        { from: 'src/billing', to: 'src/invoicing', files: 1 },
        { from: 'src/invoicing', to: 'src/billing', files: 2 },
      ]),
    });

    expect(sentenceOf(run)).toBe(
      'They import each other: src/billing imports src/invoicing in 1 file, src/invoicing imports src/billing in 2 files.',
    );
  });
  it('says neither imports the other when a publisher reported no edge between them', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([{ from: 'src/billing', to: 'src/shared', files: 4 }]),
    });

    expect(sentenceOf(run)).toBe(
      'Neither imports the other, so what they share is not visible as a dependency.',
    );
  });
  it('says the dependency is unknown when no analyzer published imports', () => {
    const run = joined({ 'change-history': historyReport(), coupling: { findings: [] } });

    expect(sentenceOf(run)).toBe(
      'No analyzer reported imports for this run, so whether one imports the other is unknown.',
    );
  });
  it('lifts folders inside a feature to the feature module and adds edges from all publishers', () => {
    const pair = { ...PAIR, first: 'src/features/billing', second: 'src/features/invoicing' };
    const run = joined({
      'change-history': historyReport(pair),
      java: publisher([
        { from: 'src/features/billing/api', to: 'src/features/invoicing/model', files: 2 },
      ]),
      kotlin: publisher([{ from: 'src/features/billing', to: 'src/features/invoicing', files: 1 }]),
    });

    expect(sentenceOf(run)).toBe('src/features/billing imports src/features/invoicing in 3 files.');
  });
  it('keeps a plain subfolder as its own module outside features', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([{ from: 'src/billing/api', to: 'src/invoicing', files: 2 }]),
    });

    expect(sentenceOf(run)).toBe(
      'Neither imports the other, so what they share is not visible as a dependency.',
    );
  });
  it('honours configured feature roots', () => {
    const pair = { ...PAIR, first: 'app/modules/billing', second: 'app/modules/invoicing' };
    const run = joined(
      {
        'change-history': historyReport(pair),
        coupling: publisher([
          { from: 'app/modules/billing/api', to: 'app/modules/invoicing', files: 1 },
        ]),
      },
      { layout: { featureRoots: ['app/modules'] } },
    );

    expect(sentenceOf(run)).toBe('app/modules/billing imports app/modules/invoicing in 1 file.');
  });
  it('leaves other findings alone, keeps the identity and drops the import section', () => {
    const other = {
      tool: 'eslint',
      rule: 'x',
      path: 'a.ts',
      identity: 'a|b',
      message: CO_CHANGE_ADVICE,
      classification: 'enforceable',
    };
    const run = joined({
      'change-history': historyReport(),
      coupling: { findings: [other], moduleImports: [] },
    });

    expect(run.reports.get('coupling')).toEqual({ findings: [other] });
    expect(run.reports.get('change-history').findings[0].identity).toBe(
      'src/billing|src/invoicing',
    );
  });
});
