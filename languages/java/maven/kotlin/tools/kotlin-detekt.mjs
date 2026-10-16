import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../maven-command.mjs';
import { EMPTY_SARIF, kotlinFiles } from './kotlin-files.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';

const DETEKT_DIRECTORY = path.resolve(GRADLE_DIRECTORY, '../detekt');
const FINDINGS_EXIT_CODE = 2;
const STDLIB_JAR = /^kotlin-stdlib/u;
const JAVA_HOME_LINE = /java\.home = (.+)/u;

export function jdkHome() {
  const home = process.env.JAVA_HOME;
  if (home !== undefined && home !== '') {
    return home;
  }
  const result = spawnSync(javaCommand('java'), ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  });
  return JAVA_HOME_LINE.exec(`${result.stderr}${result.stdout}`)?.[1].trim();
}

export function detektClasspath({ detektStdlib, javaClassDirectory, mainCompile }) {
  const libraries = mainCompile.filter(
    (entry) => existsSync(entry) && !STDLIB_JAR.test(path.basename(entry)),
  );
  return [
    ...detektStdlib,
    ...(existsSync(javaClassDirectory) ? [javaClassDirectory] : []),
    ...libraries,
  ];
}

export function detektArguments({ module, report, options, classpath, home }) {
  const configs = [
    options.detektConfig,
    path.join(DETEKT_DIRECTORY, 'nitpicker-detekt.yml'),
    options.detektLists,
    path.join(DETEKT_DIRECTORY, 'detekt-validation.yml'),
  ].filter((config) => config !== undefined);
  return [
    ...['--input', module.kotlin.sourceRoots.join(',')],
    ...['--includes', '**/*.kt'],
    ...['--report', `sarif:${report}`],
    ...['--base-path', module.basedir],
    '--build-upon-default-config',
    ...['--config', configs.join(',')],
    ...['--classpath', classpath.join(path.delimiter)],
    ...(home === undefined ? [] : ['--jdk-home', home]),
  ];
}

export function runDetekt({ module, reportDir, tools, classpaths, javaClassDirectory, options }) {
  const report = path.join(reportDir, 'detekt.sarif');
  if (kotlinFiles(module.kotlin.sourceRoots).length === 0) {
    writeFileSync(report, EMPTY_SARIF);
    return;
  }
  const classpath = detektClasspath({
    detektStdlib: tools['detekt-stdlib'],
    javaClassDirectory,
    mainCompile: classpaths.mainCompile,
  });
  runJava({
    tool: 'detekt',
    classpath: tools.detekt,
    mainClass: 'io.gitlab.arturbosch.detekt.cli.Main',
    args: detektArguments({ module, report, options, classpath, home: jdkHome() }),
    cwd: module.basedir,
    accept: (result) =>
      (result.status === 0 || result.status === FINDINGS_EXIT_CODE) && existsSync(report),
  });
}
