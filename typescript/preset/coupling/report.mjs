import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeCoupling } from './analyze.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const outputPath = path.join(projectRoot, 'reports/quality/coupling/report.json');
const report = {
  analyzer: 'dependency-cruiser + project coupling metrics',
  policy: 'report-only; no coupling thresholds',
  sourceRoot: 'src/main',
  ...analyzeCoupling(cruise(['src/main']), 'src/main'),
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
