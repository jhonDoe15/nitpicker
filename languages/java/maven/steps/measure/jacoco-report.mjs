import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COVERAGE_DATA } from '../../maven-build.mjs';
import { requireReport, runJavaTool } from '../java-tool.mjs';

const EMPTY_REPORT = '<?xml version="1.0" encoding="UTF-8"?><report name="nitpicker"></report>';

export function runJacocoReport(context) {
  const { module, reportRoot, tools } = context;
  const report = path.join(reportRoot, 'jacoco.xml');
  const data = path.join(module.basedir, COVERAGE_DATA);
  if (!existsSync(module.classesDirectory)) {
    writeFileSync(report, EMPTY_REPORT);
    return;
  }
  runJavaTool(context, {
    label: 'JaCoCo',
    jar: tools.classpath('jacoco-cli')[0],
    args: [
      'report',
      ...(existsSync(data) ? [data] : []),
      '--classfiles',
      module.classesDirectory,
      ...module.sourceRoots.flatMap((root) => ['--sourcefiles', root]),
      '--xml',
      report,
    ],
  });
  requireReport(report, 'JaCoCo');
}
