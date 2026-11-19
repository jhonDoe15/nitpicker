import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { runJava } from './maven-command.mts';
import { classEntries } from '../builds/classes/class-file.mts';
import { failedCaseEntries, freshReports } from '../builds/test-failures.mts';
import { callUntyped, type JavaSpawn } from '../adapters/typed/java-values.mts';
import type { ToolClasspaths } from './typed/kotlin-types.mts';

type ReportModule = { readonly surefireReports: string; readonly failsafeReports: string };
type ArchunitMatch = (className: string) => boolean;
type ArchunitRun = {
  readonly module: ReportModule & {
    readonly testOutputDirectory: string;
    readonly basedir: string;
  };
  readonly reportDir: string;
  readonly since: number;
  readonly isArchunit: ArchunitMatch;
};
type TestFailure = { readonly text: string; readonly detail: unknown };
type TestOutcome = {
  readonly testsRan: boolean;
  readonly failure: { module: string; tests: string[]; details: unknown[] } | undefined;
};
type JacocoRun = {
  readonly module: {
    readonly basedir: string;
    readonly coordinates: string;
    readonly outputDirectory: string;
    readonly sourceRoots: readonly string[];
  };
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly execFiles: readonly string[];
  readonly since: number;
  readonly testsRan: boolean;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: unknown;
};

const patternMatcher: (pattern: string) => { test(file: string): boolean } = globMatcher;
const failedCases: (report: string, options: { readonly retriesPass: boolean }) => TestFailure[] =
  failedCaseEntries;

const DEFAULT_ARCHUNIT_INCLUDES = '**/*ArchTest.class,**/*ArchitectureTest.class';
const JUNIT_ENGINE_JAR = /^junit-platform-engine-.+\.jar$/u;
const TESTNG_JAR = /^testng-\d.*\.jar$/u;

export function archunitPatterns(includes: string = DEFAULT_ARCHUNIT_INCLUDES): string[] {
  return includes
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

export function archunitMatcher(includes: string = DEFAULT_ARCHUNIT_INCLUDES): ArchunitMatch {
  const patterns = archunitPatterns(includes).map((pattern) => patternMatcher(pattern));
  return (className: string) => {
    const file = `${className.replaceAll('.', '/').replace(/\$.*$/u, '')}.class`;
    return patterns.some((pattern) => pattern.test(file));
  };
}

export function classFiles(directory: string): string[] {
  return classEntries(directory).map((entry) =>
    path.relative(directory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'),
  );
}

export function testReportDirectories(module: ReportModule): [string, string][] {
  const surefire: [string, string] = ['surefire', module.surefireReports];
  const shared = path.resolve(module.failsafeReports) === path.resolve(module.surefireReports);
  return shared ? [surefire] : [surefire, ['failsafe', module.failsafeReports]];
}

export function suiteNameOf(report: string): string {
  return path.basename(report).replace(/^TEST-|\.xml$/gu, '');
}

function freshTestReports(module: ReportModule, since: number): string[] {
  return testReportDirectories(module).flatMap(([, directory]) => freshReports(directory, since));
}

function copyArchunitReports(
  reports: readonly string[],
  reportDir: string,
  isArchunit: ArchunitMatch,
): void {
  const archunitDir = path.join(reportDir, 'archunit');
  for (const report of reports.filter((candidate) => isArchunit(suiteNameOf(candidate)))) {
    mkdirSync(archunitDir, { recursive: true });
    copyFileSync(report, path.join(archunitDir, path.basename(report)));
  }
}

function testOutcome({
  moduleName,
  failures,
  testsRan,
}: {
  readonly moduleName: string;
  readonly failures: readonly TestFailure[];
  readonly testsRan: boolean;
}): TestOutcome {
  if (failures.length === 0) {
    return { testsRan, failure: undefined };
  }
  const failure = {
    module: moduleName,
    tests: failures.map(({ text }) => text),
    details: failures.map(({ detail }) => detail),
  };
  return { testsRan, failure };
}

export function collectArchunitResults({
  module,
  reportDir,
  since,
  isArchunit,
}: ArchunitRun): void {
  const reports = freshTestReports(module, since);
  copyArchunitReports(reports, reportDir, isArchunit);
  requireArchunitRun(module, reports, isArchunit);
}

export function collectTestResults({
  module,
  reportDir,
  since,
  isArchunit,
  retriesPass,
  moduleName = '.',
}: ArchunitRun & { readonly retriesPass?: unknown; readonly moduleName?: string }): TestOutcome {
  const reports = freshTestReports(module, since);
  copyArchunitReports(reports, reportDir, isArchunit);
  const failures = reports
    .filter((report) => !isArchunit(suiteNameOf(report)))
    .flatMap((report) => failedCases(report, { retriesPass: retriesPass === true }));
  requireArchunitRun(module, reports, isArchunit);
  return testOutcome({
    moduleName,
    failures,
    testsRan: reports.length > 0,
  });
}

function requireArchunitRun(
  module: ArchunitRun['module'],
  reports: readonly string[],
  isArchunit: ArchunitMatch,
): void {
  const archunitClasses = topLevelClasses(module.testOutputDirectory).filter(isArchunit);
  if (archunitClasses.length > 0 && !reports.some((report) => isArchunit(suiteNameOf(report)))) {
    throw new Error(
      `Neither maven-surefire-plugin nor maven-failsafe-plugin ran any of the ArchUnit classes in ${module.basedir} ` +
        `(${archunitClasses.join(', ')}). Let surefire run them (its <includes>, no skipTests) ` +
        'so nitpicker can read their results',
    );
  }
}

export function freshExecFiles(execFiles: readonly string[], since: number): string[] {
  return [...new Set(execFiles)].filter(
    (file) => existsSync(file) && statSync(file).mtimeMs >= since,
  );
}

export function runJacocoReport(options: JacocoRun): void {
  const { module, reportDir, tools, execFiles, since, testsRan, spawn, timeoutMs } = options;
  const report = path.join(reportDir, 'jacoco.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    writeFileSync(report, `<?xml version="1.0"?><report name="${module.coordinates}"></report>`);
    return;
  }
  const fresh = freshExecFiles(execFiles, since);
  if (fresh.length === 0 && testsRan) {
    throw new Error(
      `JaCoCo recorded no coverage in ${module.basedir}: the tests ran without its agent. If maven-surefire-plugin sets <argLine>, start it with @{argLine} so the agent stays attached`,
    );
  }
  callUntyped(runJava, {
    tool: 'JaCoCo',
    classpath: tools['jacoco'],
    mainClass: 'org.jacoco.cli.internal.Main',
    args: [
      'report',
      ...fresh,
      '--classfiles',
      module.outputDirectory,
      ...module.sourceRoots
        .filter((root) => existsSync(root))
        .flatMap((root) => ['--sourcefiles', root]),
      '--xml',
      report,
      '--quiet',
    ],
    cwd: module.basedir,
    accept: (result: unknown) => fieldOf(result, 'status') === 0,
    spawn,
    timeoutMs,
  });
}

function topLevelClasses(classDirectory: string): string[] {
  return [
    ...new Set(
      classFiles(classDirectory).map((file) =>
        file
          .replace(/\.class$/u, '')
          .replaceAll('/', '.')
          .replace(/\$.*$/u, ''),
      ),
    ),
  ];
}

export function pitTests(testClassDirectory: string, isArchunit: ArchunitMatch): string[] {
  return topLevelClasses(testClassDirectory).filter((name) => !isArchunit(name));
}

export function junitLauncherVersion(classpath: readonly unknown[]): string | undefined {
  const names = classpath.map((entry) => path.basename(textOf(entry)));
  const engine = names.find((name) => JUNIT_ENGINE_JAR.test(name));
  return engine === undefined || names.some((name) => name.startsWith('junit-platform-launcher-'))
    ? undefined
    : engine.replace(/^junit-platform-engine-|\.jar$/gu, '');
}

export function pitClasspath(tools: ToolClasspaths, testRuntime: readonly unknown[]): string[] {
  const names = testRuntime.map((entry) => path.basename(textOf(entry)));
  const launcher = junitLauncherVersion(testRuntime);
  return [
    ...(tools['pit'] ?? []),
    ...(names.some((name) => JUNIT_ENGINE_JAR.test(name)) ? (tools['pit-junit5'] ?? []) : []),
    ...(launcher === undefined ? [] : (tools[`launcher-${launcher}`] ?? [])),
    ...(names.some((name) => TESTNG_JAR.test(name)) ? (tools['pit-testng'] ?? []) : []),
  ];
}

export function missingLauncherVersions(
  analyzed: readonly { readonly classpaths: { readonly testRuntime: readonly unknown[] } }[],
): string[] {
  const versions = analyzed.map(({ classpaths }) => junitLauncherVersion(classpaths.testRuntime));
  return [...new Set(versions.filter((version) => version !== undefined))];
}
