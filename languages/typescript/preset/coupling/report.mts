import path from 'node:path';
import { printLine, writeReport } from '../../../../shared/report-output/report-output.mts';
import { cruise, existingRoots } from '../dependency-graph/typed/graph-views.mts';
import { analyzeCoupling, readLayout } from './typed/typed-rules.mts';

const layout = readLayout();
const { sourceRoot } = layout;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const outputPath = path.join(projectRoot, 'reports/quality/coupling/report.json');
const report = {
  analyzer: 'dependency-cruiser + project coupling metrics',
  policy: 'report-only; no coupling thresholds',
  sourceRoot,
  ...analyzeCoupling(cruise(existingRoots(projectRoot, layout.sourceRoots)), sourceRoot, {
    layout,
  }),
};

await writeReport({
  projectRoot,
  outputPath,
  report,
  summaryExtras: { stabilityDirectionSignals: report.stabilityDirection.length },
});
printLine('\nHighest-coupled modules (fan-in / fan-out / instability):');
for (const entry of report.hubs) {
  printLine(
    `${String(entry.fanIn)}\t${String(entry.fanOut)}\t${String(entry.instability ?? 'N/A')}\t${entry.source}`,
  );
}
