import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  BAD,
  DANGER,
  FAREWELL,
  FAREWELL_TEST,
  GREETER_TEST_WITHOUT_JAVA,
  LEGACY_WITH_COMMENT,
  MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
  META,
} from '../test-support/kotlin-lint-data.mjs';
import {
  commitBranch,
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
  removeProject,
  summarize,
  writeAll,
} from './test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;
const mavenDiffOf = mavenDiffRunner(maven);

const BAD_DETEKT_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
];

const BAD_BRANCH_FINDINGS = ['jacoco changed-branch-coverage Bad.kt'];

const BAD_KTLINT_RULES = [
  'ktlint.standard:blank-line-before-declaration',
  'ktlint.standard:colon-spacing',
  'ktlint.standard:comma-spacing',
  'ktlint.standard:function-expression-body',
  'ktlint.standard:function-return-type-spacing',
  'ktlint.standard:function-signature',
  'ktlint.standard:if-else-wrapping',
  'ktlint.standard:no-wildcard-imports',
  'ktlint.standard:op-spacing',
  'ktlint.standard:parameter-list-spacing',
  'ktlint.standard:statement-wrapping',
];

const SPOTLESS_KTFMT = `<plugin>
  <groupId>com.diffplug.spotless</groupId>
  <artifactId>spotless-maven-plugin</artifactId>
  <version>2.44.0</version>
  <configuration>
    <java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>
    <kotlin><ktfmt><style>KOTLINLANG</style></ktfmt></kotlin>
  </configuration>
</plugin>`;

const LEGACY_FINDINGS = [
  'detekt detekt.style.FunctionOnlyReturningConstant Legacy.kt',
  'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
];

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: detekt, ktlint and ktfmt', () => {
  let project;
  let kotlinOnlyProject;

  beforeAll(() => {
    kotlinOnlyProject = initializeMavenProject();
    rmSync(path.join(kotlinOnlyProject.root, 'src/main/java'), { recursive: true });
    writeAll(kotlinOnlyProject, {
      'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA,
    });
    git(kotlinOnlyProject, 'add', '-A');
    git(kotlinOnlyProject, 'commit', '-q', '-m', 'Kotlin only');
    commitBranch(kotlinOnlyProject, 'kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    project = initializeMavenProject();
    commitBranch(project, 'clean', {
      [`${kotlinSources}/Farewell.kt`]: FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    commitBranch(project, 'violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    commitBranch(project, 'java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    commitBranch(project, 'detekt-config', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      'config/detekt.yml': MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
    });
    commitBranch(project, 'no-formatter', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      '.editorconfig': null,
      'pom.xml': readFileSync(path.join(project.root, 'pom.xml'), 'utf8').replace(
        '</properties>',
        '<formatter>com.facebook:ktfmt</formatter><ktlint.rules>ktlint</ktlint.rules></properties>',
      ),
    });
    commitBranch(project, 'ktfmt', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      [`${kotlinSources}/Meta.kt`]: META,
    });
    commitBranch(project, 'ktfmt-named', {
      'pom.xml': readFileSync(path.join(project.root, 'pom.xml'), 'utf8').replace(
        '<plugins>',
        `<plugins>${SPOTLESS_KTFMT}`,
      ),
    });
  });
  afterAll(() => {
    removeProject(project);
    removeProject(kotlinOnlyProject);
  });
  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = mavenDiffOf(project, 'clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });
  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = mavenDiffOf(project, 'violation');

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
    const result = mavenDiffOf(project, 'clean');

    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });
  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = mavenDiffOf(project, 'java-in-kotlin-module');

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
    const result = mavenDiffOf(project, 'detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
  });
  it("runs detekt with the project's config laid over the defaults when the project is listed", () => {
    const result = mavenDiffOf(project, 'detekt-config', { policy: kotlinPolicyWithProjectDetekt });

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });
  it('runs no format check for a project that only mentions a formatter in a property', () => {
    const result = mavenDiffOf(project, 'no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });
  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = mavenDiffOf(project, 'ktfmt', {
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
    git(project, 'checkout', '-q', 'ktfmt-named');
    const findings = collectJavaFindings(project.root, { maven, policy: kotlinPolicy });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(formatters.has('ktfmt')).toBe(true);
    expect(formatters.has('ktlint')).toBe(false);
  });
  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    const result = mavenDiffOf(kotlinOnlyProject, 'kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
