import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaCommand, runJava } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';
import { classFiles } from '../../builds/classes/class-file.mjs';
import { runPermits } from '../../builds/classes/class-permits.mts';
import { runJavacLint } from '../../builds/lint/javac-lint-runner.mjs';
import { runDependencies } from './maven-dependencies.mts';
import { runCpd } from './maven-pmd.mts';
import { guardCompiler } from '../errorprone/maven-compiler.mjs';
import { processorPath } from '../errorprone/maven-errorprone.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';

type GuardContext = Readonly<Record<string, unknown>> & { readonly reportDir: string };

function outputOf(module: MavenModule): string {
  return textOf(module['outputDirectory']);
}

function mainCompileOf(context: GuardContext): string[] {
  return textsOf(fieldOf(context['classpaths'], 'mainCompile'));
}

function runForbiddenApis(context: GuardContext): void {
  const module = mavenModuleOf(context['module']);
  const report = path.join(context.reportDir, 'forbidden-apis.txt');
  rmSync(report, { force: true });
  if (listOf(classFiles(outputOf(module))).length === 0) {
    return;
  }
  const command = callUntyped(toolCommand, 'forbiddenapis', {
    classDirectories: [outputOf(module)],
    libraries: mainCompileOf(context).filter((entry) => existsSync(entry)),
    signatures: path.join(GRADLE_DIRECTORY, 'rules/forbidden-apis.txt'),
  });
  const result = callUntyped(runJava, {
    tool: 'forbiddenapis',
    classpath: fieldOf(context['tools'], 'forbiddenapis'),
    mainClass: 'de.thetaphi.forbiddenapis.cli.CliMain',
    args: fieldOf(command, 'args'),
    cwd: module.basedir,
    accept: (run: unknown) => callUntyped(fieldOf(command, 'accepts'), fieldOf(run, 'status')),
    spawn: context['spawn'],
  });
  writeFileSync(report, `${textOf(fieldOf(result, 'stdout'))}${textOf(fieldOf(result, 'stderr'))}`);
}

export function lintPlan(
  context: GuardContext,
  projectRoot: unknown,
): Readonly<Record<string, unknown>> {
  const module = mavenModuleOf(context['module']);
  const lintDirectory = path.join(module.buildDirectory, 'nitpicker-lint');
  const classpath = mainCompileOf(context);
  return {
    root: projectRoot,
    basedir: module.basedir,
    reportRoot: module.basedir,
    sources: javaFiles(textsOf(module['sourceRoots'])),
    generatedSources: [path.join(module.buildDirectory, 'generated-sources/annotations')],
    classDirectory: module['outputDirectory'],
    classpath,
    processorPath: callUntyped(processorPath, classpath, module['compiler'], context['tools']),
    javac: javaCommand('javac'),
    compiler: callUntyped(guardCompiler, module['compiler']),
    workDirectory: path.join(lintDirectory, 'work'),
    cacheDirectory: lintDirectory,
    spawn: context['spawn'],
  };
}

export function runGuards(context: GuardContext, project: unknown): void {
  const reportDir = context.reportDir;
  callUntyped(runJavacLint, lintPlan(context, fieldOf(project, 'projectRoot')), {
    reportDir,
    baselineRoot: fieldOf(project, 'baselineRoot'),
  });
  runForbiddenApis(context);
  callUntyped(runCpd, context);
  callUntyped(runDependencies, { ...context, reactor: fieldOf(project, 'reactor') });
  runPermits({ classDirectories: [fieldOf(context['module'], 'outputDirectory')], reportDir });
}
