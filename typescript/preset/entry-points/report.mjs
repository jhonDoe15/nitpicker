import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise } from '../dependency-graph/cruise.mjs';
import { analyzeEntryPoints } from './analyze.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const outputPath = path.join(projectRoot, 'reports/quality/entry-points/report.json');
const report = {
  analyzer: 'resolved production entry-point analysis',
  policy:
    'report-only; only bypassing an existing reachable entry-point export affects exit status',
  sourceRoot: 'src/main',
  ...analyzeEntryPoints(cruise(['src/main']), 'src/main'),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify({ output: path.relative(projectRoot, outputPath), ...report.summary }, null, 2),
);
for (const finding of report.publicAlternativeBypasses) {
  console.log(
    `PUBLIC ALTERNATIVE\t${finding.source} -> ${finding.target} (use ${finding.publicEntryPoint})`,
  );
}
for (const finding of report.unexportedTargetImports) {
  console.log(`NOT EXPORTED\t${finding.source} -> ${finding.target}`);
}
for (const finding of report.missingEntryPointImports) {
  console.log(`NO ENTRY POINT\t${finding.source} -> ${finding.target}`);
}

if (report.publicAlternativeBypasses.length > 0) {
  process.exitCode = 1;
}
