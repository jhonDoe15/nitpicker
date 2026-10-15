import { format as formatOutput } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeEntryPoints } from './analyze.mjs';
import { existingRoots } from '../layout.mjs';
import { readLayout } from '../head-policy.mjs';

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

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(
  formatOutput(
    JSON.stringify({ output: path.relative(projectRoot, outputPath), ...report.summary }, null, 2),
  ) + '\n',
);
for (const finding of report.publicAlternativeBypasses) {
  process.stdout.write(
    formatOutput(
      `PUBLIC ALTERNATIVE\t${finding.source} -> ${finding.target} (use ${finding.publicEntryPoint})`,
    ) + '\n',
  );
}
for (const finding of report.unexportedTargetImports) {
  process.stdout.write(formatOutput(`NOT EXPORTED\t${finding.source} -> ${finding.target}`) + '\n');
}
for (const finding of report.missingEntryPointImports) {
  process.stdout.write(
    formatOutput(`NO ENTRY POINT\t${finding.source} -> ${finding.target}`) + '\n',
  );
}

if (report.publicAlternativeBypasses.length > 0) {
  process.exitCode = 1;
}
