import path from 'node:path';
import { printLine, writeReport } from '../../../../shared/report-output/report-output.mts';
import { analyzeProductionFiles } from './analyze.mts';
import { readLayout } from './typed/rule-views.mts';
import type { Metric, Ranked } from './typed/analysis-types.mts';

const output = process.stdout;

const layout = readLayout();
const { sourceRoot } = layout;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const outputPath = path.join(projectRoot, 'reports/quality/structure/report.json');
const report = {
  analyzer: 'TypeScript syntax-tree structural metrics',
  policy: 'report-only; no size, nesting, or parameter thresholds',
  sourceRoot,
  ...analyzeProductionFiles(path.join(projectRoot, sourceRoot), sourceRoot, { layout }),
};

await writeReport({ projectRoot, outputPath, report, output });
const rankings: Readonly<Record<string, readonly Ranked[]>> = report.rankings;
const METRIC_NAMES = new Map<string, Metric>([
  ['functionLines', 'lines'],
  ['functionStatements', 'statements'],
  ['functionControlNesting', 'maxControlNesting'],
  ['functionParameters', 'parameters'],
  ['classLines', 'lines'],
  ['classMembers', 'members'],
]);
for (const [name, entries] of Object.entries(rankings)) {
  printLine(output, `\n${name}:`);
  const metricName = METRIC_NAMES.get(name);
  for (const entry of entries.slice(0, 10)) {
    const displayName = entry.function ?? entry.class;
    const metric = metricName === undefined ? undefined : entry[metricName];
    printLine(
      output,
      `${String(metric)}\t${entry.source}:${String(entry.start)}\t${String(displayName)}`,
    );
  }
}
