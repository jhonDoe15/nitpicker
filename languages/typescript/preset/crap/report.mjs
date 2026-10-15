import { format as formatOutput } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import config from '../defaults/crap.config.mjs';
import { readLayout } from '../head-policy.mjs';
import { analyzeWithFunctionMapFallback } from './analyze.mjs';

const projectRoot = path.resolve(
  process.env.NITPICKER_PROJECT_ROOT ?? path.resolve(import.meta.dirname, '../../../..'),
);
const coverageReportPath = path.resolve(projectRoot, config.coverageReportPath);
const outputPath = path.resolve(projectRoot, config.outputPath);
const analysis = await analyzeWithFunctionMapFallback({
  projectRoot,
  explicitPaths: explicitPaths(),
  coverageMode: 'existing-only',
  coverageReportPath,
  excludes: config.excludes,
});

const functions = analysis.metrics
  .map((metric) => ({
    source: metric.relativePath,
    function: metric.displayName,
    lines: {
      start: metric.startLine,
      end: metric.endLine,
    },
    complexity: metric.complexity,
    statementCoverage: metric.statementCoverage,
    branchCoverage: metric.branchCoverage,
    effectiveCoverage: metric.coverage,
    crap: metric.crapScore,
  }))
  .sort((left, right) => {
    if (left.crap === null) {
      return right.crap === null ? 0 : 1;
    }
    if (right.crap === null) {
      return -1;
    }
    return right.crap - left.crap;
  });

const report = {
  analyzer: '@barney-media/crap-typescript',
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

process.stdout.write(
  formatOutput(JSON.stringify({ output: config.outputPath, ...report.summary }, null, 2)) + '\n',
);
for (const entry of functions.slice(0, 20)) {
  const crap = entry.crap === null ? 'N/A' : entry.crap.toFixed(2);
  const location = `${entry.source}:${entry.lines.start}`;
  process.stdout.write(
    formatOutput(`${crap}\tCC ${entry.complexity}\t${location}\t${entry.function}`) + '\n',
  );
}

function explicitPaths() {
  const layout = readLayout();
  return config.sourcePaths
    .filter((sourcePath) => existsSync(path.resolve(projectRoot, sourcePath)))
    .flatMap((sourcePath) =>
      path.basename(sourcePath) === 'src'
        ? [sourcePath]
        : layout.projectCodeFiles(projectRoot, [sourcePath]).filter(layout.isSourceFile),
    );
}
