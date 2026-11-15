import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeJavaSnapshot,
  collectJavaFindings,
  exceptionRoute,
} from '../test-support/views/kotlin-e2e-views.mts';
import {
  legacyInitChecks,
  generatedBranchChecks,
  structureChangeChecks,
  testOnlyFacadeChecks,
} from '../coverage-and-structure/__tests__/kotlin-coverage-expectations.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { useKotlinCoverageProject } from '../__tests__/kotlin-coverage-project.mts';
import {
  fromTool,
  git,
  initializeMavenProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  mavenDiffRunner,
} from './__tests__/kotlin-maven-project.mts';

const maven = process.env['NITPICKER_MAVEN'];
const mavenDiffOf = mavenDiffRunner(maven);

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: coverage and structure', () => {
  const fixture = useKotlinCoverageProject({ initialize: initializeMavenProject });
  it('fails a changed Kotlin branch that no test takes together with its surviving mutants', () => {
    const result = mavenDiffOf(fixture.project, 'one-sided-branch');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([
      'jacoco changed-branch-coverage Label.kt',
    ]);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ message, location }) => ({ message, location })),
    ).toEqual([
      {
        message: `Branch coverage is 50.00%; minimum is 95%. Add a test for each outcome it misses. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Label.kt`, function: 'Label.larger' })}`,
        location: { line: 4 },
      },
    ]);
    expect(fromTool(result.newEnforceable, 'pit')).toEqual([
      'pit mutant-survived Label.kt',
      'pit mutant-survived Label.kt',
    ]);
  });
  it('fails the untested branches of a statement that spans lines and of a file outside its package directory', () => {
    const result = mavenDiffOf(fixture.project, 'multiline-branch');

    expect(result.failed).toBe(true);
    expect(
      result.newEnforceable
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location?.line)}`)
        .sort(),
    ).toEqual(['Offset.kt:4', 'Spread.kt:10', 'Spread.kt:7']);
  });
  it('passes a line whose only branches are inlined from the standard library and keeps a real branch beside one', () => {
    const result = mavenDiffOf(fixture.project, 'library-branches');
    const jacoco = result.newEnforceable.filter(({ tool }) => tool === 'jacoco');

    expect(
      jacoco
        .map(({ path: file, location }) => `${path.basename(file)}:${String(location?.line)}`)
        .sort(),
    ).toEqual(['Library.kt:12', 'Library.kt:14', 'Library.kt:18']);
    expect(
      assigned(
        jacoco.find(({ location }) => location?.line === 14),
        'line 14 finding',
      ).message,
    ).toBe(
      `Branch coverage is 50.00%; minimum is 95%. Not taken: a branch of this line or of isNullOrBlank, which is inlined from the standard library (pass null to take its null arm). Test it, or remove it if it can't happen. ${exceptionRoute({ rule: 'changed-branch-coverage', path: `${kotlinSources}/Library.kt`, function: 'Library.present' })}`,
    );
  });
  it('passes interfaces, a fun interface and exhaustive whens over a sealed interface and an enum', () => {
    const result = mavenDiffOf(fixture.project, 'ports');

    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual([]);
  });
  it('does not ask for coverage of branches the Kotlin compiler generated', () => {
    git(fixture.project, 'checkout', '-q', 'generated-branches');
    const findings = collectJavaFindings(fixture.project.root, { maven, policy: kotlinPolicy });
    const report = readFileSync(
      path.join(fixture.project.root, 'target/nitpicker/jacoco.xml'),
      'utf8',
    );
    const comparison = generatedBranchChecks(report, findings);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('applies the structure, CRAP, clone and stability rules to one change', () => {
    const result = mavenDiffOf(fixture.project, 'head', { base: 'structure-base' });
    const comparison = structureChangeChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('reports a Kotlin file facade only tests use and spares a file with a main function', () => {
    const result = mavenDiffOf(fixture.project, 'test-only');

    const comparison = testOnlyFacadeChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('keeps a legacy init block baselined when init blocks are inserted around it, in a class, a companion object and an object expression', () => {
    const result = mavenDiffOf(fixture.project, 'init-inserted', { base: 'init-base' });

    const comparison = legacyInitChecks(result);

    expect(comparison.actual).toEqual(comparison.expected);
  });
  it('reports a Maven compile failure as compile-error findings at the broken file', () => {
    git(fixture.project, 'checkout', '-q', 'broken');

    const { findings } = analyzeJavaSnapshot(fixture.project.root, { maven, policy: kotlinPolicy });

    expect([
      ...new Set(
        findings.map(
          ({ tool, rule, classification, path: file }) =>
            `${tool}/${rule} ${classification} ${file}`,
        ),
      ),
    ]).toEqual([
      `build/compile-error enforceable ${kotlinSources}/Broken.kt`,
      'kotlin/compile-failed-skipped tool-error .',
    ]);
  });
});
