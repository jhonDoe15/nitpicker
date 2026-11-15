import path from 'node:path';
import { printLine, writeReport } from '../../../../shared/report-output/report-output.mts';
import { cruise as untypedCruise } from '../dependency-graph/cruise.mjs';
import { existingRoots } from '../dependency-graph/typed/graph-views.mts';
import { analyzeTestRuntime, loadModuleSources } from './analyze.mts';
import { readLayout as untypedReadLayout } from '../head-policy.mjs';
import type { AnalysisLayout, Graph } from './analysis-types.mts';

const output = process.stdout;

const cruise: (paths: readonly string[]) => Graph = untypedCruise;
const readLayout: () => AnalysisLayout = untypedReadLayout;

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
      sourceTexts: await loadModuleSources(graph, projectRoot, layout),
    }))()),
};

await writeReport({ projectRoot, outputPath, report, output });
if (report.findings.length > 0) {
  printLine(output, '\nTests without a verified production runtime:');
  for (const finding of report.findings) {
    printLine(output, `${finding.category}\t${finding.test}`);
  }
  process.exitCode = 1;
}
