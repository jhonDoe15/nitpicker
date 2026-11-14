import path from 'node:path';
import { printLine, writeReport } from '../../../../shared/report-output/report-output.mts';
import { cruise, existingRoots } from '../dependency-graph/typed/graph-views.mts';
import { analyzeEntryPoints, readLayout } from './typed/typed-analysis.mts';

const output = process.stdout;

const layout = readLayout();
const { sourceRoot } = layout;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const outputPath = path.join(projectRoot, 'reports/quality/entry-points/report.json');
const report = {
  analyzer: 'resolved production entry-point analysis',
  policy:
    'report-only; only bypassing an existing reachable entry-point export affects exit status',
  sourceRoot,
  ...analyzeEntryPoints(cruise(existingRoots(projectRoot, [sourceRoot])), sourceRoot, { layout }),
};

await writeReport({ projectRoot, outputPath, report, output });
for (const finding of report.publicAlternativeBypasses) {
  printLine(
    output,
    `PUBLIC ALTERNATIVE\t${finding.source} -> ${finding.target} (use ${String(finding.publicEntryPoint)})`,
  );
}
for (const finding of report.unexportedTargetImports) {
  printLine(output, `NOT EXPORTED\t${finding.source} -> ${finding.target}`);
}
for (const finding of report.missingEntryPointImports) {
  printLine(output, `NO ENTRY POINT\t${finding.source} -> ${finding.target}`);
}

if (report.publicAlternativeBypasses.length > 0) {
  process.exitCode = 1;
}
