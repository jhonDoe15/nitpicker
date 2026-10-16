import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.resolve(import.meta.dirname, '../fixtures/test-frameworks');
const OTHER_BUILD_FILES = { gradle: ['pom.xml'], maven: ['build.gradle', 'settings.gradle'] };
const CALC = 'src/main/java/demo/Calc.java';
const temporary = [];

const CALC_FINDINGS = [
  `jacoco line-coverage ${CALC} line-coverage 66.67`,
  `jacoco uncovered-method ${CALC} cov:4baacdbea5f88deb`,
  `pit mutant-nocoverage ${CALC} demo.Calc|half(I)I|MathMutator|Replaced integer division with multiplication#1`,
  `pit mutant-nocoverage ${CALC} demo.Calc|half(I)I|PrimitiveReturnsMutator|replaced int return with 0 for demo/Calc::half#1`,
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
    GRADLE_STEP_TIMEOUT_MS,
  );

  it.each(['gradle', 'maven'])(
    'measures coverage and mutants of a TestNG project on %s',
    (build) => {
      expect(summary(findingsOf('testng', build))).toEqual(CALC_FINDINGS);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it.each(['gradle', 'maven'])(
    'measures coverage and mutants of a Spock project on %s and finds its slow features in the Groovy sources',
    (build) => {
      const findings = findingsOf('spock', build, { testSeconds: { unitTestSeconds: -1 } });
      const slow = findings
        .filter(({ tool }) => tool === 'test-runtime')
        .map(({ path: file, identity, location }) => ({ file, identity, location }));

      expect(summary(findings.filter(({ tool }) => tool !== 'test-runtime'))).toEqual(
        CALC_FINDINGS,
      );
      expect(slow).toEqual([
        {
          file: 'src/test/groovy/demo/CalcSpec.groovy',
          identity: 'test:demo.CalcSpec#doubles the value',
          location: { line: 6 },
        },
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
