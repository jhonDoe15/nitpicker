import { existsSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { relativeTo } from '../manifest/maven-manifest.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writeJdepsReports } from '../../builds/jdeps-reports.mjs';

export function runStructure({ module, reportDir, spawn }) {
  const roots = module.sourceRoots
    .filter((root) => existsSync(root))
    .map((root) => relativeTo(module.basedir, root));
  runJava({
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
    spawn,
  });
}

export function runJdeps({ module, reportDir, spawn }) {
  writeJdepsReports({
    command: javaCommand('jdeps'),
    cwd: module.basedir,
    mainDirectory: module.outputDirectory,
    testDirectory: module.testOutputDirectory,
    reportDir,
    spawn,
  });
}
