import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import config from '../defaults/crap.config.mjs';
import { readLayout } from '../head-policy.mjs';
import { measureCrap } from './measure.mjs';
import { reportFunctionsOf } from './report-functions.mjs';

const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];

const layout = readLayout();
const projectRoot = path.resolve(
  process.env.NITPICKER_PROJECT_ROOT ?? path.resolve(import.meta.dirname, '../../../..'),
);
const coverageReportPath = path.resolve(projectRoot, config.coverageReportPath);
const outputPath = path.resolve(projectRoot, config.outputPath);
const analysis = measureCrap(projectRoot, sourceFiles(), {
  extensions: layout.javascript ? layout.extensions : TYPESCRIPT_EXTENSIONS,
  excludes: config.excludes,
  coverageReportPath,
});

const functions = reportFunctionsOf(analysis.metrics);

const report = {
  analyzer: 'nitpicker-crap',
  policy: 'report-only',
  coverageReport: config.coverageReportPath,
  summary: {
    files: analysis.selectedFiles.length,
    functions: functions.length,
    measuredFunctions: functions.filter((entry) => entry.crap !== null).length,
    unknownCoverageFunctions: functions.filter((entry) => entry.crap === null).length,
  },
  warnings: analysis.warnings,
  sourceExclusions: analysis.sourceExclusionAudit,
  functions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ output: config.outputPath, ...report.summary }, null, 2));
for (const entry of functions.slice(0, 20)) {
  console.log(
    `${entry.crap === null ? 'N/A' : entry.crap.toFixed(2)}\tCC ${entry.complexity}\t${entry.source}:${entry.lines.start}\t${entry.function}`,
  );
}

function sourceFiles() {
  return config.sourcePaths
    .filter((sourcePath) => existsSync(path.resolve(projectRoot, sourcePath)))
    .flatMap((sourcePath) =>
      layout.projectCodeFiles(projectRoot, [sourcePath]).filter(layout.isSourceFile),
    )
    .map((file) => path.resolve(projectRoot, file));
}
