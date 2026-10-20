import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEST_RESULTS_DIRECTORY } from '../../adapters/test-times/slow-tests.mjs';
import { pitTests, suiteNameOf, testReportDirectories } from '../maven-tests.mjs';
import { freshReports } from '../../builds/test-failures.mjs';
const TESTNG_JAR = /^testng-\d.*\.jar$/u;
const PLATFORM_ENGINE_JAR = /^junit-platform-engine-.+\.jar$/u;
const TESTNG_ENGINE_JAR = /^testng-engine-.+\.jar$/u;
const REDIRECTED_OUTPUT = /^(.+)-output\.txt$/u;

function copyReports(reports, target) {
  if (reports.length === 0) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const report of reports) {
    copyFileSync(report, path.join(target, path.basename(report)));
  }
}

function freshOutputs(directory, since, isArchunit) {
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => REDIRECTED_OUTPUT.test(name))
        .filter((name) => !isArchunit(REDIRECTED_OUTPUT.exec(name)[1]))
        .map((name) => path.join(directory, name))
        .filter((file) => statSync(file).mtimeMs >= since)
    : [];
}

export function copyTestResults({ module, reportDir, since, isArchunit }) {
  for (const [task, directory] of testReportDirectories(module)) {
    copyReports(
      [
        ...freshReports(directory, since).filter((report) => !isArchunit(suiteNameOf(report))),
        ...freshOutputs(directory, since, isArchunit),
      ],
      path.join(reportDir, TEST_RESULTS_DIRECTORY, task),
    );
  }
}

function platformHidesTestng(testRuntime) {
  const names = testRuntime.map((entry) => path.basename(entry));
  return (
    names.some((name) => TESTNG_JAR.test(name)) &&
    names.some((name) => PLATFORM_ENGINE_JAR.test(name)) &&
    !names.some((name) => TESTNG_ENGINE_JAR.test(name))
  );
}

function hasNonArchunitCase(report, isArchunit) {
  const root = parseXml(readFileSync(report, 'utf8'));
  const suites = root.name === 'testsuites' ? childrenNamed(root, 'testsuite') : [root];
  return suites.some((suite) =>
    childrenNamed(suite, 'testcase').some(
      (testCase) =>
        !isArchunit(testCase.attrs.classname ?? suite.attrs.name ?? suiteNameOf(report)),
    ),
  );
}

export function requireTestngRun({ module, since, isArchunit, testRuntime }) {
  if (
    !platformHidesTestng(testRuntime) ||
    pitTests(module.testOutputDirectory, isArchunit).length === 0
  ) {
    return;
  }
  const reports = testReportDirectories(module).flatMap(([, directory]) =>
    freshReports(directory, since),
  );
  if (!reports.some((report) => hasNonArchunitCase(report, isArchunit))) {
    throw new Error(
      `Surefire ran none of the tests in ${module.basedir} but the ArchUnit classes: the JUnit Platform on its ` +
        'test classpath makes Surefire use its JUnit Platform provider, which runs TestNG tests only through ' +
        'the TestNG engine. Add org.junit.support:testng-engine to the test dependencies, or run TestNG in ' +
        'a Surefire execution of its own',
    );
  }
}
