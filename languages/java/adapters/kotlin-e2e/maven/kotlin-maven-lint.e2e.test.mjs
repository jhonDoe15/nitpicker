import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveProjectHeadPolicy } from '../../../../../core/conventions/project-head-policy.mjs';
import { collectJavaFindings } from '../../java-diff.mjs';
import { withHeadPolicy } from '../../java-runner.mjs';
import { BAD } from '../test-support/kotlin-lint-data.mjs';
import {
  BAD_BRANCH_FINDINGS,
  BAD_DETEKT_FINDINGS,
  BAD_KTLINT_RULES,
  LEGACY_FINDINGS,
  useKotlinLintProject,
} from '../__tests__/kotlin-lint-project.mjs';
import {
  fromTool,
  git,
  initializeMavenProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinPolicyWithProjectDetekt,
  kotlinSources,
  ktlintOf,
  ktlintRules,
  mavenDiffRunner,
  summarize,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;
const mavenDiffOf = mavenDiffRunner(maven);

const SPOTLESS_KTFMT = `<plugin>
  <groupId>com.diffplug.spotless</groupId>
  <artifactId>spotless-maven-plugin</artifactId>
  <version>2.44.0</version>
  <configuration>
    <java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>
    <kotlin><ktfmt><style>KOTLINLANG</style></ktfmt></kotlin>
  </configuration>
</plugin>`;

function mavenLintBranches(project) {
  const pom = readFileSync(path.join(project.root, 'pom.xml'), 'utf8');
  return {
    'no-formatter': {
      [`${kotlinSources}/Bad.kt`]: BAD,
      '.editorconfig': null,
      'pom.xml': pom.replace(
        '</properties>',
        '<formatter>com.facebook:ktfmt</formatter><ktlint.rules>ktlint</ktlint.rules></properties>',
      ),
    },
    'ktfmt-named': { 'pom.xml': pom.replace('<plugins>', `<plugins>${SPOTLESS_KTFMT}`) },
  };
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: detekt, ktlint and ktfmt', () => {
  const fixture = useKotlinLintProject({
    initialize: initializeMavenProject,
    branches: mavenLintBranches,
  });
  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = mavenDiffOf(fixture.project, 'clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });
  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = mavenDiffOf(fixture.project, 'violation');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(fromTool(result.unchangedFindings, 'ktlint')).toEqual([]);
    expect(Math.min(...ktlintOf(result.newEnforceable).map(({ location }) => location.line))).toBe(
      3,
    );
  });
  it('does not lint generated sources registered from the build directory', () => {
    const result = mavenDiffOf(fixture.project, 'clean');

    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });
  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = mavenDiffOf(fixture.project, 'java-in-kotlin-module');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'errorprone')).toEqual([
      'errorprone EmptyCatch Danger.java',
    ]);
    expect(fromTool(result.newEnforceable, 'pmd')).toEqual([]);
    expect(
      result.newEnforceable.filter((finding) =>
        ['detekt', 'ktlint', 'ktfmt'].includes(finding.tool),
      ),
    ).toEqual([]);
  });
  it("leaves the project's detekt config out unless the project is listed", () => {
    const result = mavenDiffOf(fixture.project, 'detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
  });
  it("runs detekt with the project's config laid over the defaults when the project is listed", () => {
    const result = mavenDiffOf(fixture.project, 'detekt-config', {
      policy: kotlinPolicyWithProjectDetekt,
    });

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });
  it('runs no format check for a project that only mentions a formatter in a property', () => {
    const result = mavenDiffOf(fixture.project, 'no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });
  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = mavenDiffOf(fixture.project, 'ktfmt', {
      policy: { preset: 'kotlin', kotlinFormatter: 'ktfmt' },
    });

    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_DETEKT_FINDINGS, ...BAD_BRANCH_FINDINGS, 'ktfmt format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'ktfmt')).toEqual(
      ['Greeter', 'GreeterTest', 'Legacy'].map((name) => `ktfmt format ${name}.kt`),
    );
  });
  it('detects ktfmt from the Spotless Kotlin step of the effective POM, next to a Java formatter', () => {
    git(fixture.project, 'checkout', '-q', 'ktfmt-named');
    const head = resolveProjectHeadPolicy(kotlinPolicy, fixture.project.root, { maven });
    const findings = collectJavaFindings(fixture.project.root, {
      maven,
      policy: withHeadPolicy(kotlinPolicy, head),
    });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(head.kotlin).toEqual({ formatter: 'ktfmt', build: 'maven', ktfmtStyle: 'kotlinlang' });
    expect([...formatters]).toEqual(['ktfmt']);
  });
  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    const result = mavenDiffOf(fixture.kotlinOnlyProject, 'kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
