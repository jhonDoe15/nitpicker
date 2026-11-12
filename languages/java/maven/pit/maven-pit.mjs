import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { mavenBudget } from '../../adapters/gradle-wrapper/gradle-budget.mjs';
import { nitpickerPitArguments } from '../../adapters/tool-config/declared/pit-declared.mjs';
import { pitHistoryArguments } from '../../builds/pit-history/pit-history.mjs';
import { writePitFailure } from '../../builds/pit-failure/pit-failure.mjs';
import { classFiles, pitClasspath, pitTests } from '../maven-tests.mjs';
import { pitRunTargets } from '../module/pit-scope.mjs';

const MINUTE_MS = 60_000;

export function pitTimeoutMs(
  timeoutMs = mavenBudget().commandTimeoutMs,
  deadline = Number.POSITIVE_INFINITY,
  now = Date.now(),
) {
  return Math.min(timeoutMs, Math.floor((deadline - now) / MINUTE_MS) * MINUTE_MS);
}

function notStarted(module) {
  return (
    `PIT was not started in ${module.basedir}: less than a minute of the Java analyzer's time ` +
    'limit was left. Set NITPICKER_MAVEN_TIMEOUT_MINUTES, or analyzerTimeoutMinutes when the ' +
    'config sets it, to give the Java analyzer more time'
  );
}

export function javaArgumentFile(args) {
  return args
    .map((argument) => {
      const escaped = argument
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r');
      return `"${escaped}"\n`;
    })
    .join('');
}

function pitArgLine(pitDir, args) {
  if (args.length === 0) {
    return [];
  }
  const file = path.join(pitDir, 'jvm-arguments');
  writeFileSync(file, javaArgumentFile(args));
  const quote = file.includes('"') ? "'" : '"';
  return ['--argLine', `${quote}@${file}${quote}`];
}

function pitArguments({ module, pitDir, classpaths, isArchunit, configs, history, targets }) {
  return [
    '--reportDir',
    pitDir,
    '--targetClasses',
    targets.join(','),
    '--targetTests',
    pitTests(module.testOutputDirectory, isArchunit).join(','),
    '--sourceDirs',
    module.sourceRoots.filter((root) => existsSync(root)).join(','),
    '--classPath',
    [...new Set(classpaths.testRuntime)].filter((entry) => existsSync(entry)).join(','),
    '--mutableCodePaths',
    module.outputDirectory,
    '--outputFormats',
    'XML',
    '--timestampedReports',
    'false',
    ...(configs?.pit?.arguments ?? nitpickerPitArguments()),
    '--failWhenNoMutations',
    'false',
    '--verbose',
    'false',
    ...pitArgLine(pitDir, module.testJvmArgs),
    ...pitHistoryArguments(history, module.buildDirectory),
  ];
}

function pitRan(options, { pitDir, limit, targets }) {
  const { module, tools, classpaths, isArchunit, configs, history, spawn } = options;
  try {
    runJava({
      tool: 'PIT',
      classpath: pitClasspath(tools, classpaths.testRuntime),
      mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
      args: pitArguments({ module, pitDir, classpaths, isArchunit, configs, history, targets }),
      cwd: module.basedir,
      accept: (result) => result.status === 0,
      spawn,
      timeoutMs: limit,
    });
    return true;
  } catch (error) {
    writePitFailure(pitDir, error);
    return false;
  }
}

export function runPit(options) {
  const { module, reportDir, timeoutMs, deadline, scope } = options;
  const pitDir = path.join(reportDir, 'pit');
  rmSync(pitDir, { recursive: true, force: true });
  mkdirSync(pitDir, { recursive: true });
  const report = path.join(pitDir, 'mutations.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  const targets = pitRunTargets(module, scope);
  if (targets.length === 0) {
    writeFileSync(report, '<mutations/>');
    return;
  }
  const limit = pitTimeoutMs(timeoutMs, deadline);
  if (limit < MINUTE_MS) {
    writePitFailure(pitDir, notStarted(module));
    return;
  }
  if (pitRan(options, { pitDir, limit, targets }) && !existsSync(report)) {
    writeFileSync(report, '<mutations/>');
  }
}
