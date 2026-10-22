import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { collectJavaFindings } from '../java-diff.mjs';
import {
  ARCHUNIT_FINDING,
  CALC,
  CALC_FINDINGS,
  NAMING_ARCH_TEST,
  enabled,
  gradle,
  summary,
  useFrameworkProjects,
  withRuleClassOf,
} from './__tests__/test-frameworks-project.mjs';

describe.skipIf(!enabled)('Java preset on JUnit and ArchUnit test frameworks', () => {
  const { projectOf, findingsOf } = useFrameworkProjects();
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
});
