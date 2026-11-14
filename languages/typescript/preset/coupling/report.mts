import { format as formatOutput } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeCoupling, cruise, existingRoots, readLayout } from './typed/typed-rules.mts';

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

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(
  formatOutput(
    JSON.stringify(
      {
        output: path.relative(projectRoot, outputPath),
        ...report.summary,
        stabilityDirectionSignals: report.stabilityDirection.length,
      },
      null,
      2,
    ),
  ) + '\n',
);
process.stdout.write(
  formatOutput('\nHighest-coupled modules (fan-in / fan-out / instability):') + '\n',
);
for (const entry of report.hubs) {
  process.stdout.write(
    formatOutput(
      `${String(entry.fanIn)}\t${String(entry.fanOut)}\t${String(entry.instability ?? 'N/A')}\t${entry.source}`,
    ) + '\n',
  );
}
