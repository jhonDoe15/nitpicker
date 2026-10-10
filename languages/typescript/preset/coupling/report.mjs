import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeCoupling } from './analyze.mjs';
import { existingRoots } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();
const { sourceRoot } = layout;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const outputPath = path.join(projectRoot, 'reports/quality/coupling/report.json');
const report = {
  analyzer: 'dependency-cruiser + project coupling metrics',
  policy: 'report-only; no coupling thresholds',
  sourceRoot,
  ...analyzeCoupling(cruise(existingRoots(projectRoot, [sourceRoot])), sourceRoot, { layout }),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      output: path.relative(projectRoot, outputPath),
      ...report.summary,
      stabilityDirectionSignals: report.stabilityDirection.length,
    },
    null,
    2,
  ),
);
console.log('\nHighest-coupled modules (fan-in / fan-out / instability):');
for (const entry of report.hubs) {
  console.log(`${entry.fanIn}\t${entry.fanOut}\t${entry.instability ?? 'N/A'}\t${entry.source}`);
}
