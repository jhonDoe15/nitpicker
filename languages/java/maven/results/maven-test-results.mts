import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { pitTests, suiteNameOf, testReportDirectories } from '../maven-tests.mjs';
import { freshReports } from '../../builds/test-failures.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { childrenNamed, parseXml } from '../../../../shared/values/xml.mts';
import { fieldOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

type IsArchunit = (name: string) => boolean;
type ResultsCopy = {
  readonly module: unknown;
  readonly reportDir: string;
  readonly since: number;
  readonly isArchunit: IsArchunit;
};
type TestngCheck = {
  readonly module: unknown;
  readonly since: number;
  readonly isArchunit: IsArchunit;
  readonly testRuntime: readonly unknown[];
};

const TESTNG_JAR = /^testng-\d.*\.jar$/u;
const PLATFORM_ENGINE_JAR = /^junit-platform-engine-.+\.jar$/u;
const TESTNG_ENGINE_JAR = /^testng-engine-.+\.jar$/u;
const REDIRECTED_OUTPUT = /^(.+)-output\.txt$/u;

function copyReports(reports: readonly string[], target: string): void {
  if (reports.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const report of reports) {
    copyFileSync(report, path.join(target, path.basename(report)));
  }
}

function freshOutputs(directory: string, since: number, isArchunit: IsArchunit): string[] {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => {
          const suite = REDIRECTED_OUTPUT.exec(name)?.[1];
          return suite !== undefined && !isArchunit(suite);
        })
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

function reportDirectories(module: unknown): [string, string][] {
  return listOf(testReportDirectories(module)).map((entry) => {
    const [task, directory] = textsOf(entry);
    return [task ?? '', directory ?? ''];
  });
}

function freshReportsIn(directory: string, since: number): string[] {
  return textsOf(freshReports(directory, since));
}

function suiteName(report: string): string {
  return textOf(suiteNameOf(report));
}

export function copyTestResults({ module, reportDir, since, isArchunit }: ResultsCopy): void {
  for (const [task, directory] of reportDirectories(module)) {
    copyReports(
      [
        ...freshReportsIn(directory, since).filter((report) => !isArchunit(suiteName(report))),
        ...freshOutputs(directory, since, isArchunit),
      ],
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}

function platformHidesTestng(testRuntime: readonly unknown[]): boolean {
  const names = testRuntime.map((entry) => path.basename(textOf(entry)));
  return (
    names.some((name) => TESTNG_JAR.test(name)) &&
    names.some((name) => PLATFORM_ENGINE_JAR.test(name)) &&
    !names.some((name) => TESTNG_ENGINE_JAR.test(name))
  );
}

function hasNonArchunitCase(report: string, isArchunit: IsArchunit): boolean {
  const root = parseXml(readFileSync(report, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.some((suite) =>
    childrenNamed(suite, 'testcase').some(
      (testCase) =>
        !isArchunit(testCase.attrs['classname'] ?? suite.attrs['name'] ?? suiteName(report)),
    ),
  );
}

export function requireTestngRun({ module, since, isArchunit, testRuntime }: TestngCheck): void {
  const tests = listOf(callUntyped(pitTests, fieldOf(module, 'testOutputDirectory'), isArchunit));
  if (!platformHidesTestng(testRuntime) || tests.length === 0) {
    return;
  }
  const reports = reportDirectories(module).flatMap(([, directory]) =>
    freshReportsIn(directory, since),
  );
  if (!reports.some((report) => hasNonArchunitCase(report, isArchunit))) {
    throw new Error(
      `Surefire ran none of the tests in ${textOf(fieldOf(module, 'basedir'))} but the ArchUnit classes: the JUnit Platform on its ` +
        'test classpath makes Surefire use its JUnit Platform provider, which runs TestNG tests only through ' +
        'the TestNG engine. Add org.junit.support:testng-engine to the test dependencies, or run TestNG in ' +
        'a Surefire execution of its own',
    );
  }
}
