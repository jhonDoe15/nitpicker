import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaCommand, runJava } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';
import { classFiles } from '../../builds/classes/class-file.mjs';
import { runPermits } from '../../builds/classes/class-permits.mjs';
import { runJavacLint } from '../../builds/lint/javac-lint-runner.mjs';
import { runDependencies } from './maven-dependencies.mjs';
import { runCpd } from './maven-pmd.mjs';
import { guardCompiler } from '../errorprone/maven-compiler.mjs';
import { toolCommand } from '../../builds/tools/tool-commands.mjs';

function runForbiddenApis({ module, reportDir, tools, classpaths, spawn }) {
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  const libraries = classpaths.mainCompile.filter((entry) => existsSync(entry));
  const command = toolCommand('forbiddenapis', {
    classDirectories: [module.outputDirectory],
    libraries,
    signatures: path.join(GRADLE_DIRECTORY, 'rules/forbidden-apis.txt'),
  });
  const result = runJava({
    tool: 'forbiddenapis',
    classpath: tools.forbiddenapis,
    mainClass: 'de.thetaphi.forbiddenapis.cli.CliMain',
    args: command.args,
    cwd: module.basedir,
    accept: ({ status }) => command.accepts(status),
    spawn,
  });
  writeFileSync(path.join(reportDir, 'forbidden-apis.txt'), `${result.stdout}${result.stderr}`);
}

function lintPlan({ module, classpaths, spawn }, projectRoot) {
  const lintDirectory = path.join(module.buildDirectory, 'nitpicker-lint');
  return {
    root: projectRoot,
    basedir: module.basedir,
    reportRoot: module.basedir,
    sources: javaFiles(module.sourceRoots),
    generatedSources: [path.join(module.buildDirectory, 'generated-sources/annotations')],
    classDirectory: module.outputDirectory,
    classpath: classpaths.mainCompile,
    processorPath: classpaths.mainCompile,
    javac: javaCommand('javac'),
    compiler: guardCompiler(module.compiler),
    workDirectory: path.join(lintDirectory, 'work'),
    cacheDirectory: lintDirectory,
    spawn,
  };
}

export function runGuards(context, { projectRoot, baselineRoot, reactor }) {
  runJavacLint(lintPlan(context, projectRoot), { reportDir: context.reportDir, baselineRoot });
  runForbiddenApis(context);
  runCpd(context);
  runDependencies({ ...context, reactor });
  runPermits({ classDirectories: [context.module.outputDirectory], reportDir: context.reportDir });
}
