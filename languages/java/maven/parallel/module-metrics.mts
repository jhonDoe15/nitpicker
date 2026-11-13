import { existsSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../maven-command.mjs';
import { parserJava, sourceLevel } from '../errorprone/maven-jdk.mjs';
import { relativeTo } from '../module/module-paths.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writeJdepsReports } from '../../builds/classes/jdeps-reports.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

type MetricsOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };

export function runStructure(options: MetricsOptions): void {
  const module = mavenModuleOf(options['module']);
  const roots = textsOf(module['sourceRoots'])
    .filter((root) => existsSync(root))
    .map((root) => textOf(relativeTo(module.basedir, root)));
  const parser = callUntyped(parserJava, { level: callUntyped(sourceLevel, module['compiler']) });
  callUntyped(runJava, {
    java: fieldOf(parser, 'java'),
    tool: 'StructureMetrics',
    args: [
      path.join(GRADLE_DIRECTORY, 'StructureMetrics.java'),
      path.join(options.reportDir, 'structure.json'),
      path.join(options.reportDir, 'classes.json'),
      module.basedir,
      ...roots,
    ],
    cwd: module.basedir,
    accept: (result: unknown) => fieldOf(result, 'status') === 0,
    spawn: options['spawn'],
    timeoutMs: options['timeoutMs'],
  });
}

export function runJdeps(options: MetricsOptions): void {
  const module = mavenModuleOf(options['module']);
  callUntyped(writeJdepsReports, {
    command: textOf(javaCommand('jdeps')),
    cwd: module.basedir,
    mainDirectory: module['outputDirectory'],
    testDirectory: module['testOutputDirectory'],
    reportDir: options.reportDir,
    spawn: options['spawn'],
  });
}
