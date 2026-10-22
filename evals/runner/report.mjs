import { SHORTCUT_CATEGORIES } from './detectors.mjs';

const mean = (values) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const defined = (values) => values.filter((value) => typeof value === 'number');

function summarize(records) {
  const passes = records.filter((record) => record.passed).length;
  return {
    runs: records.length,
    passes,
    passRate: records.length === 0 ? null : passes / records.length,
    meanIterations: mean(records.map((record) => record.gate.iterations)),
    meanIterationsToGreen: mean(defined(records.map((record) => record.gate.iterationsToGreen))),
    meanCostUsd: mean(defined(records.map((record) => record.agent.costUsd))),
    totalCostUsd: sum(defined(records.map((record) => record.agent.costUsd))),
    meanTotalTokens: mean(defined(records.map((record) => record.agent.totalTokens))),
    totalTokens: sum(defined(records.map((record) => record.agent.totalTokens))),
    meanWallTimeMs: mean(records.map((record) => record.wallTimeMs)),
  };
}

function groupBy(records, keyOf) {
  const groups = new Map();
  for (const record of records) {
    const key = keyOf(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return groups;
}

/** Folds run records into the numbers the report shows. */
export function aggregate(records) {
  const byTier = groupBy(records, (record) => record.tier);
  const tiers = [...byTier.keys()];
  const categories = [
    ...new Set([
      ...SHORTCUT_CATEGORIES,
      ...records.flatMap((record) => record.shortcuts.map((shortcut) => shortcut.category)),
    ]),
  ];
  return {
    runs: records.length,
    tiers: tiers.map((tier) => ({ tier, ...summarize(byTier.get(tier)) })),
    cases: [...groupBy(records, (record) => record.caseId)].map(([caseId, caseRecords]) => ({
      caseId,
      byTier: tiers
        .filter((tier) => caseRecords.some((record) => record.tier === tier))
        .map((tier) => ({
          tier,
          ...summarize(caseRecords.filter((record) => record.tier === tier)),
          outcomes: countBy(caseRecords.filter((record) => record.tier === tier)),
        })),
    })),
    shortcuts: categories.map((category) => ({
      category,
      byTier: tiers.map((tier) => {
        const tierRecords = byTier.get(tier);
        const withShortcut = tierRecords.filter((record) =>
          record.shortcuts.some((shortcut) => shortcut.category === category),
        ).length;
        return {
          tier,
          runs: tierRecords.length,
          runsWithShortcut: withShortcut,
          rate: withShortcut / tierRecords.length,
        };
      }),
    })),
  };
}

function countBy(records) {
  const counts = {};
  for (const record of records) counts[record.outcome] = (counts[record.outcome] ?? 0) + 1;
  return counts;
}

const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`);
const fixed = (value, digits = 1) => (value === null ? 'n/a' : value.toFixed(digits));
const tokens = (value) => (value === null ? 'n/a' : Math.round(value).toLocaleString('en-US'));
const dollars = (value) => (value === null ? 'n/a' : `$${value.toFixed(4)}`);
const seconds = (milliseconds) => (milliseconds === null ? 'n/a' : fixed(milliseconds / 1000));

function table(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

/** Markdown report: pass rate per tier and case, shortcut rate per category, cost and time. */
export function renderMarkdown(records) {
  const report = aggregate(records);
  const metrics = (row) => [
    `${row.passes}/${row.runs} (${percent(row.passRate)})`,
    fixed(row.meanIterations),
    fixed(row.meanIterationsToGreen),
    dollars(row.meanCostUsd),
    tokens(row.meanTotalTokens),
    seconds(row.meanWallTimeMs),
  ];
  const metricHeader = [
    'Pass rate',
    'Gate runs',
    'To green',
    'Cost per run',
    'Tokens per run',
    'Seconds per run',
  ];
  const sections = ['# Nitpicker eval report', '', `Runs: ${report.runs}`];

  sections.push(
    '',
    '## Pass rate per tier',
    '',
    table(
      ['Tier', ...metricHeader, 'Total cost', 'Total tokens'],
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
      ['Case', 'Tier', ...metricHeader, 'Outcomes'],
      report.cases.flatMap((entry) =>
        entry.byTier.map((row) => [
          entry.caseId,
          row.tier,
          ...metrics(row),
          Object.entries(row.outcomes)
            .map(([outcome, count]) => `${outcome} ${count}`)
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
    'Share of runs with at least one shortcut of the category. Zero also means "no detector for this category yet".',
    '',
    table(
      ['Category', ...tiers],
      report.shortcuts.map((entry) => [
        entry.category,
        ...entry.byTier.map((row) => `${row.runsWithShortcut}/${row.runs} (${percent(row.rate)})`),
      ]),
    ),
  );
  return `${sections.join('\n')}\n`;
}
