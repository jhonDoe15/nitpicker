import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot, MAVEN_FAILURE_RULE } from '../../java-runner.mts';
import { runMaven as runMavenUntyped } from '../../../maven/maven-command.mjs';
import { archunitMatcher } from '../../../maven/maven-tests.mts';
import { requireTestngRun } from '../../../maven/results/maven-test-results.mts';
import { childrenNamed, parseXml } from '../../../../../shared/values/xml.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import { linkSentence as linkSentenceUntyped } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import { mavenFrameworkFindings } from '../../test-support/maven-framework.mts';
import {
  ARCHUNIT_FINDING,
  CALC_FINDINGS,
  enabled,
  maven,
  summary,
  useFrameworkProjects,
} from '../__tests__/test-frameworks-project.mts';

const runMaven: (options: {
  projectRoot: string;
  maven: string | undefined;
  args: readonly string[];
}) => unknown = runMavenUntyped;
const linkSentence: (key: string) => string | undefined = linkSentenceUntyped;

describe.skipIf(!enabled)('Java preset on TestNG and Spock test frameworks', () => {
  const { projectOf, findingsOf } = useFrameworkProjects();
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
        rule: MAVEN_FAILURE_RULE,
        path: '.',
        identity: MAVEN_FAILURE_RULE,
        classification: 'tool-error',
        message:
          `Surefire ran none of the tests in ${root} but the ArchUnit classes: the JUnit Platform on its ` +
          'test classpath makes Surefire use its JUnit Platform provider, which runs TestNG tests only through ' +
          'the TestNG engine. Add org.junit.support:testng-engine to the test dependencies, or run TestNG in ' +
          `a Surefire execution of its own. ${textOf(linkSentence('mavenFails'))}`,
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

    const reports = path.join(root, 'target/surefire-reports');
    rmSync(reports, { recursive: true, force: true });
    runMaven({
      projectRoot: root,
      maven,
      args: ['--quiet', 'test', '-Dmaven.test.failure.ignore=true'],
    });
    const reportedClasses = [
      ['demo.CalcTest', 'demo.CalcTest'],
      ['demo.NamingArchTest', 'NamingArchTest'],
    ] as const;
    const reportedBy = reportedClasses.map(([className]) => {
      const report = parseXml(readFileSync(path.join(reports, `TEST-${className}.xml`), 'utf8'));
      return childrenNamed(report, 'testcase').map(({ attrs }) => attrs['classname']);
    });
    expect(reportedBy).toEqual(reportedClasses.map(([, reportedClass]) => [reportedClass]));
    requireTestngRun({
      module: {
        basedir: root,
        testOutputDirectory: path.join(root, 'target/test-classes'),
        surefireReports: reports,
        failsafeReports: reports,
      },
      since: 0,
      isArchunit: archunitMatcher(),
      testRuntime: ['testng-7.10.2.jar', 'junit-platform-engine-1.12.2.jar'],
    });
  });

  it.each(['gradle', 'maven'] as const)(
    'measures coverage and mutants of a Spock project on %s, runs its ArchUnit rules and finds its slow features in the Groovy sources',
    (build) => {
      const policy = { testSeconds: { unitTestSeconds: -1 } };
      const findings =
        build === 'maven'
          ? mavenFrameworkFindings(projectOf('spock', build), { maven: maven ?? 'mvn', policy })
          : findingsOf('spock', build, policy);
      const slow = findings
        .filter(({ rule }) => rule === 'slow-test')
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
