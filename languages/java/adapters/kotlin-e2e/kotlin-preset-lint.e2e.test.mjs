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
  LEGACY_FINDINGS,
  BAD_DETEKT_FINDINGS,
  BAD_BRANCH_FINDINGS,
  BAD_KTLINT_RULES,
  BAD_FINDINGS,
} from '../fixtures/kotlin-preset-data.mjs';
import {
  createKotlinProject,
  fromTool,
  gradle,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  ktlintOf,
  ktlintRules,
  summarize,
} from './kotlin-e2e-project.mjs';

const project = createKotlinProject();

const kotlinOnlyProject = createKotlinProject();

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset detekt, ktlint and ktfmt end to end', () => {
  beforeAll(() => {
    kotlinOnlyProject.initialize();
    rmSync(path.join(kotlinOnlyProject.root, 'src/main/java'), { recursive: true });
    kotlinOnlyProject.writeAll({
      'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA,
    });
    kotlinOnlyProject.git('add', '-A');
    kotlinOnlyProject.git('commit', '-q', '-m', 'Kotlin only');
    kotlinOnlyProject.commitBranch('kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    project.initialize();
    project.commitBranch('clean', {
      [`${kotlinSources}/Farewell.kt`]: FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    project.commitBranch('violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    project.commitBranch('java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    project.commitBranch('detekt-config', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      'config/detekt.yml': MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
    });
    project.commitBranch('no-formatter', { [`${kotlinSources}/Bad.kt`]: BAD }, ['.editorconfig']);
    project.commitBranch('ktfmt', {
      [`${kotlinSources}/Bad.kt`]: BAD,
      [`${kotlinSources}/Meta.kt`]: META,
    });
    project.commitBranch('ktfmt-named', {
      'build.gradle.kts': `${readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    });
  });
  afterAll(() => {
    project.remove();
    kotlinOnlyProject.remove();
  });
  it('passes a tested Kotlin change and keeps the legacy detekt finding baselined when its line moves', () => {
    const result = project.diffOf('clean');

    expect(result.failed).toBe(false);
    expect(summarize(result.newEnforceable)).toEqual([]);
    expect(fromTool(result.newFindings, 'jacoco')).toEqual(['jacoco line-coverage Farewell.kt']);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
  });
  it('fails new detekt and ktlint findings (ktlint detected from .editorconfig) in Kotlin code', () => {
    const result = project.diffOf('violation');

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
    const result = project.diffOf('clean');

    expect(result.unchangedFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
    expect(result.newFindings.some(({ path: file }) => file.endsWith('Api.kt'))).toBe(false);
  });
  it('still gates Java sources of a Kotlin module with the Java tools', () => {
    const result = project.diffOf('java-in-kotlin-module');

    expect(result.failed).toBe(true);
    expect(fromTool(result.newEnforceable, 'pmd')).toEqual(['pmd EmptyCatchBlock Danger.java']);
    expect(
      result.newEnforceable.filter((finding) =>
        ['detekt', 'ktlint', 'ktfmt'].includes(finding.tool),
      ),
    ).toEqual([]);
  });
  it("runs detekt with the project's config laid over the defaults", () => {
    const result = project.diffOf('detekt-config');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([
      'detekt detekt.style.UnusedPrivateProperty Bad.kt',
    ]);
    expect(fromTool(result.newEnforceable, 'jacoco')).toEqual(BAD_BRANCH_FINDINGS);
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
  });
  it('runs no format check for a project that names no formatter', () => {
    const result = project.diffOf('no-formatter');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(result.newFindings.filter(({ tool }) => ['ktlint', 'ktfmt'].includes(tool))).toEqual([]);
  });
  it('checks formatting with ktfmt when configured, accepting code in its style', () => {
    const result = project.diffOf('ktfmt', { preset: 'kotlin', kotlinFormatter: 'ktfmt' });

    expect(summarize(result.newEnforceable)).toEqual(
      [...BAD_FINDINGS, 'ktfmt format Bad.kt'].sort(),
    );
    expect(fromTool(result.unchangedFindings, 'ktfmt')).toEqual([
      'ktfmt format Greeter.kt',
      'ktfmt format Legacy.kt',
    ]);
  });
  it('detects ktfmt from the build files when the project names it', () => {
    project.git('checkout', '-q', 'ktfmt-named');
    const findings = collectJavaFindings(project.root, { gradle, policy: kotlinPolicy });
    const formatters = new Set(
      findings.filter(({ rule }) => rule === 'format').map(({ tool }) => tool),
    );

    expect(formatters.has('ktfmt')).toBe(true);
    expect(formatters.has('ktlint')).toBe(false);
  });
  it('gates a Kotlin-only module, where the Java tools have nothing to analyze', () => {
    const result = kotlinOnlyProject.diffOf('kotlin-only-violation');

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([...BAD_DETEKT_FINDINGS].sort());
    expect(ktlintRules(result.newEnforceable)).toEqual(BAD_KTLINT_RULES);
    expect(fromTool(result.unchangedFindings, 'detekt')).toEqual(LEGACY_FINDINGS);
    expect(result.newEnforceable.filter(({ tool }) => ['pmd', 'spotbugs'].includes(tool))).toEqual(
      [],
    );
  });
});
