import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeTestRuntime, loadModuleSources } from './analyze.mjs';
import { existingRoots } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const outputPath = path.join(projectRoot, 'reports/quality/test-runtime/report.json');
const graph = cruise(existingRoots(projectRoot, layout.graphRoots));
const report = {
  analyzer: 'dependency-cruiser resolved runtime graph',
  policy: 'report-only; tests without a verified production runtime are findings',
  ...(await (async () =>
    analyzeTestRuntime(graph, {
      layout,
      productionRoots: layout.sourceRoots,
      sourceTexts: await loadModuleSources(graph, projectRoot),
    }))()),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify({ output: path.relative(projectRoot, outputPath), ...report.summary }, null, 2),
);
if (report.findings.length > 0) {
  console.log('\nTests without a verified production runtime:');
  for (const finding of report.findings) {
    console.log(`${finding.category}\t${finding.test}`);
  }
  process.exitCode = 1;
}
