import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { STRUCTURE_METRICS, toolJava } from '../errorprone/maven-jdk.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { STRUCTURE_SKIPPED } from '../../adapters/reporting/outcomes/skipped-tools.mjs';
import { writeJdepsReports } from '../../builds/classes/jdeps-reports.mjs';

export function runStructure(module, reportDir) {
  const roots = module.sourceRoots
    .filter((root) => existsSync(root))
    .map((root) => path.relative(module.basedir, root).replaceAll('\\', '/'));
  const skipped = path.join(reportDir, STRUCTURE_SKIPPED);
  rmSync(skipped, { force: true });
  const { java, problem } = toolJava(STRUCTURE_METRICS);
  if (problem !== undefined) {
    writeFileSync(path.join(reportDir, 'structure.json'), '[]\n');
    writeFileSync(path.join(reportDir, 'classes.json'), '{"files":{},"classes":[]}\n');
    writeFileSync(skipped, `${problem}\n`);
    return;
  }
  runJava({
    java,
    tool: 'StructureMetrics',
    args: [
      path.join(GRADLE_DIRECTORY, 'StructureMetrics.java'),
      path.join(reportDir, 'structure.json'),
      path.join(reportDir, 'classes.json'),
      module.basedir,
      ...roots,
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
  });
}

export function runJdepsMetrics(module, reportDir) {
  writeJdepsReports({
    command: javaCommand('jdeps'),
    cwd: module.basedir,
    mainDirectory: module.outputDirectory,
    testDirectory: module.testOutputDirectory,
    reportDir,
  });
}
