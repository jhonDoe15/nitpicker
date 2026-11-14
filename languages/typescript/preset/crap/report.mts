import { existsSync, writeSync } from 'node:fs';
import { format as formatOutput } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import config from '../defaults/crap.config.mts';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import { readLayout as readUntypedLayout } from '../head-policy.mjs';
import { measureCrap } from './measure.mts';
import { reportFunctionsOf } from './report-functions.mts';

const STDOUT = 1;
const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];

const readLayout: () => Layout & { readonly extensions: readonly string[] } = readUntypedLayout;

const layout = readLayout();
const projectRoot = path.resolve(
  process.env['NITPICKER_PROJECT_ROOT'] ?? path.resolve(import.meta.dirname, '../../../..'),
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
    measuredFunctions: functions.filter((entry) => entry.crap !== undefined).length,
    unknownCoverageFunctions: functions.filter((entry) => entry.crap === undefined).length,
  },
  warnings: analysis.warnings,
  sourceExclusions: analysis.sourceExclusionAudit,
  functions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, undefined, 2)}\n`);

writeSync(
  STDOUT,
  formatOutput(JSON.stringify({ output: config.outputPath, ...report.summary }, null, 2)) + '\n',
);
for (const entry of functions.slice(0, 20)) {
  writeSync(STDOUT, scoreLine(entry));
}

function scoreLine(entry: (typeof functions)[number]): string {
  const score = entry.crap === undefined ? 'N/A' : entry.crap.toFixed(2);
  return `${score}\tCC ${String(entry.complexity)}\t${entry.source}:${String(entry.lines.start)}\t${entry.function}\n`;
}

function resolveInsideProject(relative: string): string {
  const full = path.resolve(projectRoot, relative);
  if (!full.startsWith(projectRoot + path.sep)) {
    throw new RangeError(`${relative} is outside the project root`);
  }
  return full;
}

function sourceFiles(): string[] {
  return config.sourcePaths
    .filter((sourcePath) => existsSync(resolveInsideProject(sourcePath)))
    .flatMap((sourcePath) =>
      layout.projectCodeFiles(projectRoot, [sourcePath]).filter(layout.isSourceFile),
    )
    .map(resolveInsideProject);
}
