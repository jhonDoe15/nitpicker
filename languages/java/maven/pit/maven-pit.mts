import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../maven-command.mjs';
import { mavenBudget } from '../../adapters/gradle-wrapper/gradle-budget.mjs';
import { nitpickerPitArguments } from '../../adapters/tool-config/declared/pit-declared.mjs';
import { pitHistoryArguments } from '../../builds/pit-history/pit-history.mjs';
import { writePitFailure } from '../../builds/pit-failure/pit-failure.mjs';
import { classFiles, pitClasspath, pitTests } from '../maven-tests.mjs';
import { pitRunTargets } from '../module/pit-scope.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, listOf, numberOr, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';

type PitOptions = Readonly<Record<string, unknown>> & { readonly reportDir: string };
type PitRun = { readonly pitDir: string; readonly targets: readonly string[] };
type PitLimit = PitRun & { readonly limit: number };
type PitReport = PitRun & { readonly report: string };

const MINUTE_MS = 60_000;

function defaultTimeoutMs(): number {
  return numberOr(fieldOf(mavenBudget(), 'commandTimeoutMs'), 0);
}

export function pitTimeoutMs(
  timeoutMs: number = defaultTimeoutMs(),
  deadline: number = Number.POSITIVE_INFINITY,
  now: number = Date.now(),
): number {
  return Math.min(timeoutMs, Math.floor((deadline - now) / MINUTE_MS) * MINUTE_MS);
}

function notStarted(module: MavenModule): string {
  return (
    `PIT was not started in ${module.basedir}: less than a minute of the Java analyzer's time ` +
    'limit was left. Set NITPICKER_MAVEN_TIMEOUT_MINUTES, or analyzerTimeoutMinutes when the ' +
    'config sets it, to give the Java analyzer more time'
  );
}

export function javaArgumentFile(args: readonly string[]): string {
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

function pitArgLine(pitDir: string, args: readonly string[]): string[] {
  if (args.length === 0) {
    return [];
  }
  const file = path.join(pitDir, 'jvm-arguments');
  writeFileSync(file, javaArgumentFile(args));
  const quote = file.includes('"') ? "'" : '"';
  return ['--argLine', `${quote}@${file}${quote}`];
}

function existingJoined(entries: readonly string[]): string {
  return [...new Set(entries)].filter((entry) => existsSync(entry)).join(',');
}

function pitArguments(options: PitOptions, { pitDir, targets }: PitRun): string[] {
  const module = mavenModuleOf(options['module']);
  const pitConfig = fieldOf(fieldOf(options['configs'], 'pit'), 'arguments');
  const tests = callUntyped(pitTests, module['testOutputDirectory'], options['isArchunit']);
  return [
    ...['--reportDir', pitDir, '--targetClasses', targets.join(',')],
    ...['--targetTests', textsOf(tests).join(',')],
    ...[
      '--sourceDirs',
      textsOf(module['sourceRoots'])
        .filter((root) => existsSync(root))
        .join(','),
    ],
    ...['--classPath', existingJoined(textsOf(fieldOf(options['classpaths'], 'testRuntime')))],
    ...['--mutableCodePaths', textOf(module['outputDirectory'])],
    ...['--outputFormats', 'XML', '--timestampedReports', 'false'],
    ...textsOf(pitConfig ?? nitpickerPitArguments()),
    ...['--failWhenNoMutations', 'false', '--verbose', 'false'],
    ...pitArgLine(pitDir, textsOf(module['testJvmArgs'])),
    ...textsOf(callUntyped(pitHistoryArguments, options['history'], module.buildDirectory)),
  ];
}

function pitRan(options: PitOptions, { pitDir, limit, targets }: PitLimit): boolean {
  const testRuntime = fieldOf(options['classpaths'], 'testRuntime');
  try {
    callUntyped(runJava, {
      tool: 'PIT',
      classpath: callUntyped(pitClasspath, options['tools'], testRuntime),
      mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
      args: pitArguments(options, { pitDir, targets }),
      cwd: fieldOf(options['module'], 'basedir'),
      accept: (result: unknown) => fieldOf(result, 'status') === 0,
      spawn: options['spawn'],
      timeoutMs: limit,
    });
    return true;
  } catch (error) {
    writePitFailure(pitDir, error);
    return false;
  }
}

export function runPit(options: PitOptions): void {
  const module = mavenModuleOf(options['module']);
  const pitDir = path.join(options.reportDir, 'pit');
  rmSync(pitDir, { recursive: true, force: true });
  mkdirSync(pitDir, { recursive: true });
  const report = path.join(pitDir, 'mutations.xml');
  if (listOf(classFiles(module['outputDirectory'])).length === 0) {
    return;
  }
  const targets = textsOf(callUntyped(pitRunTargets, options['module'], options['scope']));
  if (targets.length === 0) {
    writeFileSync(report, '<mutations/>');
    return;
  }
  mutate(options, { pitDir, report, targets });
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function mutate(options: PitOptions, { pitDir, report, targets }: PitReport): void {
  const limit = pitTimeoutMs(
    optionalNumber(options['timeoutMs']),
    optionalNumber(options['deadline']),
  );
  if (limit < MINUTE_MS) {
    writePitFailure(pitDir, notStarted(mavenModuleOf(options['module'])));
    return;
  }
  if (pitRan(options, { pitDir, limit, targets }) && !existsSync(report)) {
    writeFileSync(report, '<mutations/>');
  }
}
