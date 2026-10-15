import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requireReport, runJavaTool } from '../java-tool.mjs';

const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';

export function runSpotbugs(context) {
  const { module, reportRoot, tools } = context;
  const report = path.join(reportRoot, 'spotbugs.sarif');
  if (!existsSync(module.classesDirectory)) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  runJavaTool(context, {
    label: 'SpotBugs',
    classpath: tools.classpath('spotbugs'),
    mainClass: 'edu.umd.cs.findbugs.FindBugs2',
    args: [
      '-effort:default',
      '-medium',
      '-sarif',
      '-output',
      report,
      '-sourcepath',
      module.sourceRoots.join(path.delimiter),
      module.classesDirectory,
    ],
  });
  requireReport(report, 'SpotBugs');
}
