import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { classFiles } from '../../builds/class-file.mjs';
import { runPermits } from './class-permits.mjs';
import { runDependencies } from './maven-dependencies.mjs';
import { runJavacLint } from './maven-javac-lint.mjs';
import { runCpd } from './maven-pmd.mjs';

const FORBIDDEN_FOUND_EXIT = 1;

function runForbiddenApis({ module, reportDir, tools, classpaths }) {
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  const libraries = classpaths.mainCompile.filter((entry) => existsSync(entry));
  const result = runJava({
    tool: 'forbiddenapis',
    classpath: tools.forbiddenapis,
    mainClass: 'de.thetaphi.forbiddenapis.cli.CliMain',
    args: [
      '-d',
      module.outputDirectory,
      '-c',
      libraries.join(path.delimiter),
      '-f',
      path.join(GRADLE_DIRECTORY, 'rules/forbidden-apis.txt'),
      '--allowmissingclasses',
    ],
    cwd: module.basedir,
    accept: ({ status }) => status === 0 || status === FORBIDDEN_FOUND_EXIT,
  });
  writeFileSync(path.join(reportDir, 'forbidden-apis.txt'), `${result.stdout}${result.stderr}`);
}

function baselineDirectory({ projectRoot, baselineRoot }, module) {
  return baselineRoot === undefined
    ? undefined
    : path.join(baselineRoot, path.relative(projectRoot, module.basedir));
}

export function runGuards(context, { projectRoot, baselineRoot, reactor }) {
  runJavacLint({
    ...context,
    baselineDir: baselineDirectory({ projectRoot, baselineRoot }, context.module),
  });
  runForbiddenApis(context);
  runCpd(context);
  runDependencies({ ...context, reactor });
  runPermits(context);
}
