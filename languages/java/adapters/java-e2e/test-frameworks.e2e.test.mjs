import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { collectJavaFindings } from '../java-diff.mjs';
import { analyzeJavaSnapshot } from '../java-runner.mjs';
import { runMaven } from '../../maven/maven-command.mjs';
import { archunitMatcher } from '../../maven/maven-tests.mjs';
import { requireTestngRun } from '../../maven/results/maven-test-results.mjs';
import { childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { mavenFrameworkFindings } from '../test-support/maven-framework.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.resolve(import.meta.dirname, '../fixtures/test-frameworks');
const OTHER_BUILD_FILES = { gradle: ['pom.xml'], maven: ['build.gradle', 'settings.gradle'] };
const CALC = 'src/main/java/demo/Calc.java';
const ARCHUNIT_FINDING = `archunit servicesOnly ${CALC} demo.Calc`;
const NAMING_ARCH_TEST = 'src/test/java/demo/NamingArchTest.java';
const temporary = [];

const CALC_FINDINGS = [
  `jacoco line-coverage ${CALC} line-coverage 66.67`,
  `jacoco uncovered-method ${CALC} cov:demo.Calc#half(I)I`,
  `pit mutant-nocoverage ${CALC} Calc|half(I)I|MathMutator|Replaced integer division with multiplication#1`,
  `pit mutant-nocoverage ${CALC} Calc|half(I)I|PrimitiveReturnsMutator|replaced int return with 0 for Calc::half#1`,
  'pit mutation-summary . status:Killed 2',
  'pit mutation-summary . status:NoCoverage 2',
];

function projectOf(framework, build) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${framework}-${build}-`));
  temporary.push(root);
  cpSync(path.join(fixtures, framework), root, { recursive: true });
  for (const name of OTHER_BUILD_FILES[build]) {
    rmSync(path.join(root, name), { force: true });
  }
  return root;
}

function findingsOf(framework, build, policy = {}) {
  const tool = build === 'maven' ? { maven } : { gradle };
  return collectJavaFindings(projectOf(framework, build), { ...tool, policy });
}

function withRuleClassOf(root, framework) {
  cpSync(path.join(fixtures, framework, NAMING_ARCH_TEST), path.join(root, NAMING_ARCH_TEST));
  return root;
}

function summary(findings) {
  return findings
    .filter(({ tool }) => tool !== 'coupling')
    .map(({ tool, rule, path: file, identity, metric }) =>
      [tool, rule, file, identity, metric?.value].filter((part) => part !== undefined).join(' '),
    )
    .sort();
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Java preset on each test framework', () => {
  it.each(['gradle', 'maven'])(
    'measures coverage and mutants, and runs archunit-junit4 rules, of a JUnit 4 project on %s',
    (build) => {
      expect(summary(findingsOf('junit4', build))).toEqual(
        [...CALC_FINDINGS, `archunit servicesOnly ${CALC} demo.Calc`].sort(),
      );
    },
  );

  it('runs archunit-junit5 rules on the JUnit Platform beside JUnit 4 tests on Gradle', () => {
    const root = withRuleClassOf(projectOf('junit4', 'gradle'), 'testng');
    const build = path.join(root, 'build.gradle');
    writeFileSync(build, readFileSync(build, 'utf8').replace('archunit-junit4', 'archunit-junit5'));
    const findings = collectJavaFindings(root, { gradle, policy: {} });

    expect(summary(findings.filter(({ tool }) => tool === 'archunit'))).toEqual([ARCHUNIT_FINDING]);
  });

  it('fails on Gradle when ArchUnit classes exist and no runner picked any of them up', () => {
    const root = projectOf('testng', 'gradle');
    writeFileSync(path.join(root, NAMING_ARCH_TEST), 'package demo;\n\nclass NamingArchTest {}\n');
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerArchunit'],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    );

    expect([result.status, /nitpickerArchunit ran none.*$/mu.exec(result.stderr)?.[0]]).toEqual([
      1,
      'nitpickerArchunit ran none of the ArchUnit classes in : (demo.NamingArchTest). archunit-junit4 ' +
        'rules run on JUnit 4 and archunit-junit5 rules on the JUnit Platform; declare the one the ' +
        'classes use in the test dependencies',
    ]);
  });

  it('measures coverage and mutants of a TestNG project on Gradle and runs its archunit-junit5 rules on the Platform', () => {
    expect(summary(findingsOf('testng', 'gradle'))).toEqual(
      [...CALC_FINDINGS, ARCHUNIT_FINDING].sort(),
    );
  });

  it('stops a TestNG project whose archunit-junit5 hides its tests from Surefire 3.5', () => {
    const root = projectOf('testng', 'maven');
    const { findings } = analyzeJavaSnapshot(root, { maven, policy: {} });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: 'maven-failure',
        path: '.',
        identity: 'maven-failure',
        classification: 'tool-error',
        message:
          `Surefire ran none of the tests in ${root} but the ArchUnit classes: the JUnit Platform on its ` +
          'test classpath makes Surefire use its JUnit Platform provider, which runs TestNG tests only through ' +
          'the TestNG engine. Add org.junit.support:testng-engine to the test dependencies, or run TestNG in ' +
          'a Surefire execution of its own',
      },
    ]);
  });

  it('runs TestNG beside ArchUnit with Surefire 3.6', () => {
    const root = projectOf('testng', 'maven');
    const pom = path.join(root, 'pom.xml');
    writeFileSync(
      pom,
      readFileSync(pom, 'utf8').replace('<version>3.5.4</version>', '<version>3.6.0</version>'),
    );

    const since = Date.now();
    runMaven({
      projectRoot: root,
      maven,
      args: ['--quiet', 'test', '-Dmaven.test.failure.ignore=true'],
    });
    const reports = path.join(root, 'target/surefire-reports');
    const reportedClasses = [
      ['demo.CalcTest', 'demo.CalcTest'],
      ['demo.NamingArchTest', 'NamingArchTest'],
    ];
    const reportedBy = reportedClasses.map(([className]) => {
      const report = parseXml(readFileSync(path.join(reports, `TEST-${className}.xml`), 'utf8'));
      return childrenNamed(report, 'testcase').map(({ attrs }) => attrs.classname);
    });
    expect(reportedBy).toEqual(reportedClasses.map(([, reportedClass]) => [reportedClass]));
    requireTestngRun({
      module: {
        basedir: root,
        testOutputDirectory: path.join(root, 'target/test-classes'),
        surefireReports: reports,
        failsafeReports: reports,
      },
      since,
      isArchunit: archunitMatcher(),
      testRuntime: ['testng-7.10.2.jar', 'junit-platform-engine-1.12.2.jar'],
    });
  });

  it.each(['gradle', 'maven'])(
    'measures coverage and mutants of a Spock project on %s, runs its ArchUnit rules and finds its slow features in the Groovy sources',
    (build) => {
      const policy = { testSeconds: { unitTestSeconds: -1 } };
      const findings =
        build === 'maven'
          ? mavenFrameworkFindings(projectOf('spock', build), { maven, policy })
          : findingsOf('spock', build, policy);
      const slow = findings
        .filter(({ tool }) => tool === 'test-runtime')
        .map(({ path: file, identity, location }) => ({ file, identity, location }));

      expect(summary(findings.filter(({ tool }) => tool !== 'test-runtime'))).toEqual(
        [...CALC_FINDINGS, ARCHUNIT_FINDING].sort(),
      );
      expect(slow).toEqual([
        {
          file: 'src/test/groovy/demo/CalcSpec.groovy',
          identity: 'test:demo.CalcSpec#doubles the value',
          location: { line: 6 },
        },
      ]);
    },
  );
});
