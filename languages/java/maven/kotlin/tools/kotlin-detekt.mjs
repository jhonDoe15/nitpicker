import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../maven-command.mjs';
import { EMPTY_SARIF, kotlinFiles, lintedRoots } from './kotlin-files.mjs';
import { writeKotlinNotes } from '../../../adapters/reporting/kotlin-notes.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { toolchainJdkHome } from '../../configuration/toolchain-jdk.mjs';

const DETEKT_DIRECTORY = path.resolve(GRADLE_DIRECTORY, '../detekt');
const FINDINGS_EXIT_CODE = 2;
const STDLIB_JAR = /^kotlin-stdlib/u;
const JAVA_HOME_LINE = /java\.home = (.+)/u;

function runningJdkHome(spawn) {
  const result = spawn(javaCommand('java'), ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  const found = JAVA_HOME_LINE.exec(`${result.stderr}${result.stdout}`)?.[1].trim();
  if (found === undefined) {
    throw new Error(
      'nitpicker could not find the JDK home that detekt resolves JDK types against: put a JDK on the PATH or set JAVA_HOME to it',
    );
  }
  return found;
}

export function jdkHome({ jdkToolchain }, context = {}) {
  if (jdkToolchain === undefined) {
    return { home: runningJdkHome(context.spawn ?? spawnSync) };
  }
  const home = toolchainJdkHome(jdkToolchain, context);
  if (home !== undefined) {
    return { home };
  }
  const fallback = runningJdkHome(context.spawn ?? spawnSync);
  return {
    home: fallback,
    note: `The build selects the JDK toolchain ${JSON.stringify(jdkToolchain)}, which no toolchains file lists, so detekt resolves JDK types against ${fallback}`,
  };
}

export function detektClasspath({ detektStdlib, javaClassDirectories, libraries, ownOutputs }) {
  return [
    ...new Set([
      ...detektStdlib,
      ...javaClassDirectories.filter((directory) => existsSync(directory)),
      ...libraries.filter(
        (entry) =>
          existsSync(entry) &&
          !ownOutputs.includes(entry) &&
          !STDLIB_JAR.test(path.basename(entry)),
      ),
    ]),
  ];
}

export function detektArguments({ module, report, options, classpath, home }) {
  const configs = [
    ...(options.detektLayers ?? []),
    path.join(DETEKT_DIRECTORY, 'nitpicker-detekt.yml'),
    options.detektLists,
    path.join(DETEKT_DIRECTORY, 'detekt-validation.yml'),
  ].filter((config) => config !== undefined);
  return [
    ...['--input', lintedRoots(module.kotlin).join(',')],
    ...['--includes', '**/*.kt'],
    ...['--report', `sarif:${report}`],
    ...['--base-path', module.basedir],
    '--build-upon-default-config',
    ...['--config', configs.join(',')],
    ...['--classpath', classpath.join(path.delimiter)],
    ...['--jdk-home', home],
  ];
}

export function runDetekt({ module, reportDir, tools, classpaths, javaClassDirectories, options }) {
  const report = path.join(reportDir, 'detekt.sarif');
  if (kotlinFiles(lintedRoots(module.kotlin)).length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const classpath = detektClasspath({
    detektStdlib: tools['detekt-stdlib'],
    javaClassDirectories,
    libraries: [...classpaths.mainCompile, ...classpaths.testCompile],
    ownOutputs: [module.outputDirectory, module.testOutputDirectory],
  });
  const jdk = jdkHome(module.kotlin, options.toolchains);
  writeKotlinNotes(reportDir, jdk.note === undefined ? [] : [jdk.note]);
  runJava({
    tool: 'detekt',
    classpath: tools.detekt,
    mainClass: 'io.gitlab.arturbosch.detekt.cli.Main',
    args: detektArguments({ module, report, options, classpath, home: jdk.home }),
    cwd: module.basedir,
    spawn: options.spawn,
    accept: (result) =>
      (result.status === 0 || result.status === FINDINGS_EXIT_CODE) && existsSync(report),
  });
}
