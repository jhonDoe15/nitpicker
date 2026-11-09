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
      coupling: publisher([
        { from: 'src/billing/invoice.ts', to: 'src/invoicing' },
        { from: 'src/billing/refund.ts', to: 'src/invoicing' },
        { from: 'src/billing/totals.ts', to: 'src/invoicing' },
      ]),
    });

    expect(sentenceOf(run)).toBe('src/billing imports src/invoicing in 3 files.');
  });
  it('names both directions when the modules import each other', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([
        { from: 'src/billing/invoice.ts', to: 'src/invoicing' },
        { from: 'src/invoicing/ledger.ts', to: 'src/billing' },
        { from: 'src/invoicing/totals.ts', to: 'src/billing' },
      ]),
    });

    expect(sentenceOf(run)).toBe(
      'src/billing imports src/invoicing in 1 file and src/invoicing imports src/billing in 2 files.',
    );
  });
  it('says neither imports the other when a publisher reported no edge between them', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([{ from: 'src/billing/invoice.ts', to: 'src/shared' }]),
    });

    expect(sentenceOf(run)).toBe(
      'Neither imports the other, so what they share is not visible as a dependency.',
    );
  });
  it('says the dependency is unknown when no analyzer published imports', () => {
    const run = joined({ 'change-history': historyReport(), coupling: { findings: [] } });

    expect(sentenceOf(run)).toBe(
      'Imports between them are unknown: no analyzer reported any for this run.',
    );
  });
  it('lifts folders inside a feature to the feature module and adds edges from all publishers', () => {
    const pair = { ...PAIR, first: 'src/features/billing', second: 'src/features/invoicing' };
    const run = joined({
      'change-history': historyReport(pair),
      java: publisher([
        { from: 'src/features/billing/api/Invoice.java', to: 'src/features/invoicing/model' },
        { from: 'src/features/billing/api/Refund.java', to: 'src/features/invoicing/model' },
      ]),
      kotlin: publisher([{ from: 'src/features/billing/Totals.kt', to: 'src/features/invoicing' }]),
    });

    expect(sentenceOf(run)).toBe('src/features/billing imports src/features/invoicing in 3 files.');
  });
  it('counts a file once when it imports several folders of the same module', () => {
    const pair = { ...PAIR, first: 'src/features/billing', second: 'src/features/invoicing' };
    const run = joined({
      'change-history': historyReport(pair),
      coupling: publisher([
        { from: 'src/features/billing/ui/view.ts', to: 'src/features/invoicing/api' },
        { from: 'src/features/billing/ui/view.ts', to: 'src/features/invoicing/model' },
      ]),
    });

    expect(sentenceOf(run)).toBe('src/features/billing imports src/features/invoicing in 1 file.');
  });
  it('keeps a plain subfolder as its own module outside features', () => {
    const run = joined({
      'change-history': historyReport(),
      coupling: publisher([{ from: 'src/billing/api/client.ts', to: 'src/invoicing' }]),
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
          { from: 'app/modules/billing/api/client.ts', to: 'app/modules/invoicing' },
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
