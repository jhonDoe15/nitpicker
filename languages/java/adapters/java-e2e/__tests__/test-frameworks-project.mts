import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import type { JavaFinding, JavaPolicy } from '../../typed/java-values.mts';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import { collectJavaFindings } from '../../java-diff.mts';

export const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
export const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
export const maven = process.env['NITPICKER_MAVEN'];
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/test-frameworks');
export type Build = 'gradle' | 'maven';
const OTHER_BUILD_FILES: Record<Build, string[]> = {
  gradle: ['pom.xml'],
  maven: ['build.gradle', 'settings.gradle'],
};
export const CALC = 'src/main/java/demo/Calc.java';
export const ARCHUNIT_FINDING = `archunit servicesOnly ${CALC} demo.Calc`;
export const NAMING_ARCH_TEST = 'src/test/java/demo/NamingArchTest.java';

export const CALC_FINDINGS = [
  `jacoco line-coverage ${CALC} line-coverage 66.67`,
  `jacoco uncovered-method ${CALC} cov:demo.Calc#half(I)I`,
  `pit mutant-nocoverage ${CALC} Calc|half(I)I|MathMutator|Replaced integer division with multiplication#1`,
  `pit mutant-nocoverage ${CALC} Calc|half(I)I|PrimitiveReturnsMutator|replaced int return with 0 for Calc::half#1`,
  'pit mutation-summary . status:Killed 2',
  'pit mutation-summary . status:NoCoverage 2',
];

export function withRuleClassOf(root: string, framework: string): string {
  cpSync(path.join(fixtures, framework, NAMING_ARCH_TEST), path.join(root, NAMING_ARCH_TEST));
  return root;
}

export function summary(findings: readonly JavaFinding[]): string[] {
  return findings
    .filter(({ tool }) => tool !== 'coupling')
    .filter(
      ({ tool, classification }) => tool !== 'test-runtime' || classification !== 'descriptive',
    )
    .map(({ tool, rule, path: file, identity, metric }) => {
      const value = fieldOf(metric, 'value');
      const parts = [tool, rule, file, identity];
      return (value === undefined ? parts : [...parts, value]).map(textOf).join(' ');
    })
    .sort();
}

export function useFrameworkProjects(): {
  projectOf: (framework: string, build: Build) => string;
  findingsOf: (framework: string, build: Build, policy?: JavaPolicy) => readonly JavaFinding[];
} {
  const temporary: string[] = [];
  afterAll(() => {
    for (const root of temporary.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  function projectOf(framework: string, build: Build): string {
    const root = mkdtempSync(path.join(tmpdir(), `nitpicker-${framework}-${build}-`));
    temporary.push(root);
    cpSync(path.join(fixtures, framework), root, { recursive: true });
    for (const name of OTHER_BUILD_FILES[build]) {
      rmSync(path.join(root, name), { force: true });
    }
    return root;
  }
  function findingsOf(
    framework: string,
    build: Build,
    policy: JavaPolicy = {},
  ): readonly JavaFinding[] {
    const tool = build === 'maven' ? { maven } : { gradle };
    return collectJavaFindings(projectOf(framework, build), { ...tool, policy });
  }
  return { projectOf, findingsOf };
}
