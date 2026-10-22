import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll } from 'vitest';
import {
  GREETER_TEST_WITHOUT_JAVA,
  BAD,
  FAREWELL,
  FAREWELL_TEST,
  GREETER_WITH_FAREWELL,
  LEGACY_WITH_COMMENT,
  DANGER,
  MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
  META,
} from '../test-support/kotlin-lint-data.mjs';
import {
  commitBranch,
  git,
  initializeProject,
  kotlinSources,
  removeProject,
  writeAll,
} from '../test-support/kotlin-e2e-project.mjs';

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
// Each file gets its own fixture tree and retains the original setup and cleanup.
export function useKotlinLintProject() {
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
      [`${kotlinSources}/Greeter.kt`]: GREETER_WITH_FAREWELL,
      'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
      [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
    });
    commitBranch(project, 'violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    commitBranch(project, 'java-in-kotlin-module', { 'src/main/java/demo/Danger.java': DANGER });
    commitBranch(project, 'java-palantir', { 'src/main/java/demo/Danger.java': DANGER });
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
  return {
    get project() {
      return project;
    },
    get kotlinOnlyProject() {
      return kotlinOnlyProject;
    },
  };
}
export {
  BAD_DETEKT_FINDINGS,
  BAD_BRANCH_FINDINGS,
  BAD_FINDINGS,
  BAD_KTLINT_RULES,
  LEGACY_FINDINGS,
};
