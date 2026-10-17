import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import {
  GREETER_TEST_WITHOUT_JAVA,
  BAD,
  FAREWELL,
  FAREWELL_TEST,
  LEGACY_WITH_COMMENT,
  DANGER,
  MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
  META,
} from './test-support/kotlin-lint-data.mjs';
import {
  commitBranch,
  diffOf,
  fromTool,
  git,
  gradle,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  ktlintOf,
  ktlintRules,
  removeProject,
  summarize,
  writeAll,
} from './test-support/kotlin-e2e-project.mjs';

const BAD_DETEKT_FINDINGS = [
  ...Array(6).fill('detekt detekt.style.MagicNumber Bad.kt'),
  'detekt detekt.style.UnusedPrivateProperty Bad.kt',
];

const BAD_BRANCH_FINDINGS = ['jacoco changed-branch-coverage Bad.kt'];

const BAD_FINDINGS = [...BAD_DETEKT_FINDINGS, ...BAD_BRANCH_FINDINGS];

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

const LEGACY_FINDINGS = [
  'detekt detekt.style.FunctionOnlyReturningConstant Legacy.kt',
  'detekt detekt.style.UnusedPrivateProperty Legacy.kt',
];

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
  let project;
  let kotlinOnlyProject;

  beforeAll(() => {
    kotlinOnlyProject = initializeProject();
    rmSync(path.join(kotlinOnlyProject.root, 'src/main/java'), { recursive: true });
    writeAll(kotlinOnlyProject, {
      'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA,
    });
    git(kotlinOnlyProject, 'add', '-A');
    git(kotlinOnlyProject, 'commit', '-q', '-m', 'Kotlin only');
    commitBranch(kotlinOnlyProject, 'kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    project = initializeProject();
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
    });
    commitBranch(project, 'ktfmt', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      [`${kotlinSources}/Meta.kt`]: META,
    });
    commitBranch(project, 'ktfmt-named', {
      'build.gradle.kts': `${readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    });
  });
  afterAll(() => {
    removeProject(project);
    removeProject(kotlinOnlyProject);
  });
  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = diffOf(project, 'clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });
  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = diffOf(project, 'violation');

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
    const result = diffOf(project, 'clean');

    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });
  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = diffOf(project, 'java-in-kotlin-module');

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
  it("runs detekt with the project's config laid over the defaults", () => {
    const result = diffOf(project, 'detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });
  it('runs no format check for a project that names no formatter', () => {
    const result = diffOf(project, 'no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });
  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = diffOf(project, 'ktfmt', {
      policy: { preset: 'kotlin', kotlinFormatter: 'ktfmt' },
    });

    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_FINDINGS, 'ktfmt format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'ktfmt')).toEqual(
      ['Greeter', 'GreeterTest', 'Legacy'].map((name) => `ktfmt format ${name}.kt`),
    );
  });
  it('detects ktfmt from the build files when the project names it', () => {
    git(project, 'checkout', '-q', 'ktfmt-named');
    const findings = collectJavaFindings(project.root, { gradle, policy: kotlinPolicy });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(formatters.has('ktfmt')).toBe(true);
    expect(formatters.has('ktlint')).toBe(false);
  });
  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    const result = diffOf(kotlinOnlyProject, 'kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
