import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeProductionFiles } from './analyze.mjs';
import { readLayout } from '../head-policy.mjs';

const layout = readLayout();
const { sourceRoot } = layout;

const projectRoot = path.resolve(import.meta.dirname, '../..');
const outputPath = path.join(projectRoot, 'reports/quality/structure/report.json');
const report = {
  analyzer: 'TypeScript syntax-tree structural metrics',
  policy: 'report-only; no size, nesting, or parameter thresholds',
  sourceRoot,
  ...analyzeProductionFiles(path.join(projectRoot, sourceRoot), sourceRoot, { layout }),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify({ output: path.relative(projectRoot, outputPath), ...report.summary }, null, 2),
);
for (const [name, entries] of Object.entries(report.rankings)) {
  console.log(`\n${name}:`);
  for (const entry of entries.slice(0, 10)) {
    const displayName = entry.function ?? entry.class;
    const metric =
      entry[
        {
          functionLines: 'lines',
          functionStatements: 'statements',
          functionControlNesting: 'maxControlNesting',
          functionParameters: 'parameters',
          classLines: 'lines',
          classMembers: 'members',
        }[name]
      ];
    console.log(`${String(metric)}\t${entry.source}:${String(entry.start)}\t${displayName}`);
  }
}
