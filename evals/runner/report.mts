import { type Fields, fieldAt, requiredFields, requiredText } from '../../scripts/json/fields.mts';
import { SHORTCUT_CATEGORIES, shortcutCategory } from './detectors.mts';

type Run = {
  readonly tier: string;
  readonly caseId: string;
  readonly passed: boolean;
  readonly outcome: string;
  readonly wallTimeMs: number;
  readonly iterations: number;
  readonly iterationsToGreen: number | undefined;
  readonly costUsd: number | undefined;
  readonly totalTokens: number | undefined;
  readonly shortcutCategories: readonly string[];
};

type Summary = {
  readonly runs: number;
  readonly passes: number;
  readonly passRate: number | null;
  readonly meanIterations: number | null;
  readonly meanIterationsToGreen: number | null;
  readonly meanCostUsd: number | null;
  readonly totalCostUsd: number | null;
  readonly meanTotalTokens: number | null;
  readonly totalTokens: number | null;
  readonly meanWallTimeMs: number | null;
};

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
}

function defined(values: readonly (number | undefined)[]): number[] {
  return values.filter((value) => typeof value === 'number');
}

function requiredNumber(value: unknown, what: string): number {
  if (typeof value !== 'number') throw new Error(`${what} must be a number`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseRun(record: Fields): Run {
  const shortcuts = record['shortcuts'];
  if (!Array.isArray(shortcuts)) throw new Error('run record shortcuts must be a list');
  const agent = requiredFields(record['agent'], 'run record agent');
  const gate = requiredFields(record['gate'], 'run record gate');
  return {
    tier: requiredText(record['tier'], 'run record tier'),
    caseId: requiredText(record['caseId'], 'run record caseId'),
    passed: Boolean(record['passed']),
    outcome: requiredText(record['outcome'], 'run record outcome'),
    wallTimeMs: requiredNumber(record['wallTimeMs'], 'run record wallTimeMs'),
    iterations: requiredNumber(gate['iterations'], 'run record gate iterations'),
    iterationsToGreen: optionalNumber(gate['iterationsToGreen']),
    costUsd: optionalNumber(agent['costUsd']),
    totalTokens: optionalNumber(agent['totalTokens']),
    shortcutCategories: shortcuts.map((shortcut: unknown) =>
      shortcutCategory({
        category: requiredText(fieldAt(shortcut, 'category'), 'shortcut category'),
        kind: requiredText(fieldAt(shortcut, 'kind'), 'shortcut kind'),
      }),
    ),
  };
}

function summarize(runs: readonly Run[]): Summary {
  const passes = runs.filter((run) => run.passed).length;
  const costs = defined(runs.map((run) => run.costUsd));
  const tokens = defined(runs.map((run) => run.totalTokens));
  return {
    runs: runs.length,
    passes,
    passRate: runs.length === 0 ? null : passes / runs.length,
    meanIterations: mean(runs.map((run) => run.iterations)),
    meanIterationsToGreen: mean(defined(runs.map((run) => run.iterationsToGreen))),
    meanCostUsd: mean(costs),
    totalCostUsd: sum(costs),
    meanTotalTokens: mean(tokens),
    totalTokens: sum(tokens),
    meanWallTimeMs: mean(runs.map((run) => run.wallTimeMs)),
  };
}

function groupBy(runs: readonly Run[], keyOf: (run: Run) => string): Map<string, Run[]> {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const key = keyOf(run);
    const group = groups.get(key);
    if (group) group.push(run);
    else groups.set(key, [run]);
  }
  return groups;
}

function countBy(runs: readonly Run[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) counts[run.outcome] = (counts[run.outcome] ?? 0) + 1;
  return counts;
}

export function aggregate(records: readonly Fields[]) {
  const runs = records.map(parseRun);
  const byTier = [...groupBy(runs, (run) => run.tier)];
  const categories = [
    ...new Set([...SHORTCUT_CATEGORIES, ...runs.flatMap((run) => run.shortcutCategories)]),
  ];
  return {
    runs: runs.length,
    tiers: byTier.map(([tier, tierRuns]) => ({ tier, ...summarize(tierRuns) })),
    cases: [...groupBy(runs, (run) => run.caseId)].map(([caseId, caseRuns]) => ({
      caseId,
      byTier: byTier
        .filter(([tier]) => caseRuns.some((run) => run.tier === tier))
        .map(([tier]) => {
          const caseTierRuns = caseRuns.filter((run) => run.tier === tier);
          return { tier, ...summarize(caseTierRuns), outcomes: countBy(caseTierRuns) };
        }),
    })),
    shortcuts: categories.map((category) => ({
      category,
      byTier: byTier.map(([tier, tierRuns]) => {
        const runsWithShortcut = tierRuns.filter((run) =>
          run.shortcutCategories.includes(category),
        ).length;
        return {
          tier,
          runs: tierRuns.length,
          runsWithShortcut,
          rate: runsWithShortcut / tierRuns.length,
        };
      }),
    })),
  };
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;
}

function fixed(value: number | null, digits = 1): string {
  return value === null ? 'n/a' : value.toFixed(digits);
}

function tokens(value: number | null): string {
  return value === null ? 'n/a' : Math.round(value).toLocaleString('en-US');
}

function dollars(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? 'n/a' : fixed(milliseconds / 1000);
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  function line(cells: readonly string[]): string {
    return `| ${cells.join(' | ')} |`;
  }
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function metrics(row: Summary): string[] {
  return [
    `${String(row.passes)}/${String(row.runs)} (${percent(row.passRate)})`,
    fixed(row.meanIterations),
    fixed(row.meanIterationsToGreen),
    dollars(row.meanCostUsd),
    tokens(row.meanTotalTokens),
    seconds(row.meanWallTimeMs),
  ];
}

const METRIC_HEADER = [
  'Pass rate',
  'Gate runs',
  'To green',
  'Cost per run',
  'Tokens per run',
  'Seconds per run',
];

export function renderMarkdown(records: readonly Fields[]): string {
  const report = aggregate(records);
  const sections = ['# Nitpicker eval report', '', `Runs: ${String(report.runs)}`];

  sections.push(
    '',
    '## Pass rate per tier',
    '',
    table(
      ['Tier', ...METRIC_HEADER, 'Total cost', 'Total tokens'],
      report.tiers.map((row) => [
        row.tier,
        ...metrics(row),
        dollars(row.totalCostUsd),
        tokens(row.totalTokens),
      ]),
    ),
  );
  sections.push(
    '',
    '## Pass rate per case',
    '',
    table(
      ['Case', 'Tier', ...METRIC_HEADER, 'Outcomes'],
      report.cases.flatMap((entry) =>
        entry.byTier.map((row) => [
          entry.caseId,
          row.tier,
          ...metrics(row),
          Object.entries(row.outcomes)
            .map(([outcome, count]) => `${outcome} ${String(count)}`)
            .join(', '),
        ]),
      ),
    ),
  );
  const tiers = report.tiers.map((row) => row.tier);
  sections.push(
    '',
    '## Shortcut rate per category',
    '',
    'Share of runs with at least one shortcut of the category.',
    '',
    table(
      ['Category', ...tiers],
      report.shortcuts.map((entry) => [
        entry.category,
        ...entry.byTier.map(
          (row) => `${String(row.runsWithShortcut)}/${String(row.runs)} (${percent(row.rate)})`,
        ),
      ]),
    ),
  );
  return `${sections.join('\n')}\n`;
}
