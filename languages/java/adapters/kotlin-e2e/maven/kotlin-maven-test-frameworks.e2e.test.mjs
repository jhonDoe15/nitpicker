import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  copyFixture,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeTree,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;
const CALC = 'src/main/kotlin/demo/Calc.kt';
const ARCHUNIT = `archunit servicesOnly ${CALC} demo.Calc`;
const FRAMEWORK_TOOLS = ['jacoco', 'archunit', 'pit', 'test-runtime'];
const temporary = [];

const mutant = (rule, method, mutator, description) =>
  `pit ${rule} ${CALC} Calc|${method}|${mutator}|${description}#1`;
const halfMutants = (rule) => [
  mutant(rule, 'half(I)I', 'MathMutator', 'Replaced integer division with multiplication'),
  mutant(rule, 'half(I)I', 'PrimitiveReturnsMutator', 'replaced int return with 0 for Calc::half'),
];
const plusOneMutants = (rule) => [
  mutant(rule, 'plusOne(I)I', 'MathMutator', 'Replaced integer addition with subtraction'),
  mutant(
    rule,
    'plusOne(I)I',
    'PrimitiveReturnsMutator',
    'replaced int return with 0 for Calc::plusOne',
  ),
];

const HALF_AND_PLUS_ONE_UNTESTED = [
  `jacoco uncovered-method ${CALC} cov:53b7298b94726611`,
  `jacoco uncovered-method ${CALC} cov:fd0dc3be1c95084e`,
  ...halfMutants('mutant-nocoverage'),
  ...plusOneMutants('mutant-nocoverage'),
  'pit mutation-summary . status:Killed 2',
  'pit mutation-summary . status:NoCoverage 4',
];

function findingsOf(fixture) {
  const project = copyFixture(fixture);
  temporary.push(project.root);
  return collectJavaFindings(project.root, {
    maven,
    policy: { ...kotlinPolicy, testSeconds: { unitTestSeconds: -1 } },
  }).filter(({ tool }) => FRAMEWORK_TOOLS.includes(tool));
}

function summary(findings) {
  return findings
    .filter(({ tool }) => tool !== 'test-runtime')
    .map(({ tool, rule, path: file, identity, metric }) =>
      [tool, rule, file, identity, metric?.value].filter((part) => part !== undefined).join(' '),
    )
    .sort();
}

function slowTests(findings) {
  return findings
    .filter(({ tool }) => tool === 'test-runtime')
    .map(({ path: file, identity, location }) => ({ file, identity, location }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    removeTree(root);
  }
});

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: each test framework', () => {
  it('tells mutants apart, runs ArchUnit rules and places slow tests on their spec file for Kotest', () => {
    const findings = findingsOf('kotlin-kotest');

    expect(summary(findings)).toEqual(
      [
        ARCHUNIT,
        `jacoco line-coverage ${CALC} line-coverage 75`,
        `jacoco uncovered-method ${CALC} cov:fd0dc3be1c95084e`,
        ...halfMutants('mutant-nocoverage'),
        ...plusOneMutants('mutant-survived'),
        'pit mutation-summary . status:Killed 2',
        'pit mutation-summary . status:NoCoverage 2',
        'pit mutation-summary . status:Survived 2',
      ].sort(),
    );
    expect(slowTests(findings)).toEqual(
      ['calls plusOne', 'twice/doubles the value'].map((name) => ({
        file: 'src/test/kotlin/demo/CalcSpec.kt',
        identity: `test:demo.CalcSpec#${name}`,
        location: undefined,
      })),
    );
  });

  it('measures coverage and mutants, and runs archunit-junit4 rules, of a JUnit 4 project', () => {
    const findings = findingsOf('kotlin-junit4');

    expect(summary(findings)).toEqual(
      [
        ARCHUNIT,
        `jacoco line-coverage ${CALC} line-coverage 50`,
        ...HALF_AND_PLUS_ONE_UNTESTED,
      ].sort(),
    );
    expect(slowTests(findings)).toEqual([
      {
        file: 'src/test/kotlin/demo/CalcTest.kt',
        identity: 'test:demo.CalcTest#doublesTheValue',
        location: { line: 8 },
      },
    ]);
  });

  it('measures coverage and mutants of a TestNG project', () => {
    const findings = findingsOf('kotlin-testng');

    expect(summary(findings)).toEqual(
      [`jacoco line-coverage ${CALC} line-coverage 50`, ...HALF_AND_PLUS_ONE_UNTESTED].sort(),
    );
    expect(slowTests(findings)).toEqual([
      {
        file: 'src/test/kotlin/demo/CalcTest.kt',
        identity: 'test:demo.CalcTest#doublesTheValue',
        location: { line: 8 },
      },
    ]);
  });
});
