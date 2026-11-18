import { existsSync } from 'node:fs';
import path from 'node:path';
import { javaCommand } from '../maven-command.mjs';
import { runJava } from '../programs/java-command.mts';
import { compiledProgram } from '../programs/helper-programs.mts';
import { skipWithoutJdk, sourceLevel, structureJava } from '../errorprone/maven-jdk.mts';
import { STRUCTURE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mjs';
import { relativeTo } from '../module/module-paths.mts';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writeJdepsReports } from '../../builds/classes/jdeps-reports.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { handWrittenRoots } from '../generated/generated-roots.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

const STRUCTURE_TOOL = 'StructureMetrics';

type MetricsOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };

export function runStructure(options: MetricsOptions): void {
  const module = mavenModuleOf(options['module']);
  const roots = handWrittenRoots(module, textsOf(module['sourceRoots']), options['configs'])
    .filter((root) => existsSync(root))
    .map((root) => textOf(relativeTo(module.basedir, root)));
  callUntyped(skipWithoutJdk, { reportDir: options.reportDir, file: STRUCTURE_SKIPPED }, () => {
    const jdk = callUntyped(structureJava, {
      level: callUntyped(sourceLevel, module['compiler']),
      environment: options['environment'],
    });
    const java = textOf(fieldOf(jdk, 'java'));
    const classes = callUntyped(compiledProgram, {
      tool: STRUCTURE_TOOL,
      name: 'structure-metrics',
      sources: [path.join(GRADLE_DIRECTORY, 'StructureMetrics.java')],
      version: '1',
      libraries: [],
      cwd: module.basedir,
      java,
      spawn: options['spawn'],
      timeoutMs: options['timeoutMs'],
    });
    callUntyped(runJava, {
      java,
      tool: STRUCTURE_TOOL,
      classpath: [textOf(classes)],
      mainClass: 'StructureMetrics',
      args: [
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
