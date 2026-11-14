import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll } from 'vitest';
import { assigned } from '../test-support/views/assigned.mts';
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
} from '../test-support/kotlin-lint-data.mts';
import {
  commitBranch,
  git,
  initializeProject,
  kotlinSources,
  removeProject,
  writeAll,
  type FileMap,
  type KotlinProject,
} from './kotlin-e2e-project.mts';

const BAD_DETEKT_FINDINGS = [
  ...Array.from({ length: 6 }, () => 'detekt detekt.style.MagicNumber Bad.kt'),
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
const COMMON_BRANCHES = {
  clean: {
    [`${kotlinSources}/Farewell.kt`]: FAREWELL,
    [`${kotlinSources}/Greeter.kt`]: GREETER_WITH_FAREWELL,
    'src/test/kotlin/demo/FarewellTest.kt': FAREWELL_TEST,
    [`${kotlinSources}/Legacy.kt`]: LEGACY_WITH_COMMENT,
  },
  violation: { [`${kotlinSources}/Bad.kt`]: BAD },
  'java-in-kotlin-module': { 'src/main/java/demo/Danger.java': DANGER },
  'detekt-config': {
    [`${kotlinSources}/Bad.kt`]: BAD,
    'config/detekt.yml': MAGIC_NUMBER_OFF_WITH_FORMATTING_RULESET,
  },
  ktfmt: { [`${kotlinSources}/Bad.kt`]: BAD, [`${kotlinSources}/Meta.kt`]: META },
};

export function gradleLintBranches(project: KotlinProject): Record<string, FileMap> {
  return {
    'java-palantir': { 'src/main/java/demo/Danger.java': DANGER },
    'no-formatter': { [`${kotlinSources}/Bad.kt`]: BAD, '.editorconfig': undefined },
    'ktfmt-named': {
      'build.gradle.kts': `${readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8')}\nval formatter = "com.ncorti.ktfmt.gradle"\n`,
    },
  };
}

// Each file gets its own fixture tree and retains the original setup and cleanup. The build tool's
// own branches (how a formatter is named or switched off) come from `branches`.
export function useKotlinLintProject({
  initialize = initializeProject,
  branches = gradleLintBranches,
}: {
  initialize?: () => KotlinProject;
  branches?: (project: KotlinProject) => Record<string, FileMap>;
} = {}): { readonly project: KotlinProject; readonly kotlinOnlyProject: KotlinProject } {
  let project: KotlinProject | undefined;
  let kotlinOnlyProject: KotlinProject | undefined;
  beforeAll(() => {
    const kotlinOnly = initialize();
    kotlinOnlyProject = kotlinOnly;
    rmSync(path.join(kotlinOnly.root, 'src/main/java'), { recursive: true });
    writeAll(kotlinOnly, {
      'src/test/kotlin/demo/GreeterTest.kt': GREETER_TEST_WITHOUT_JAVA,
    });
    git(kotlinOnly, 'add', '-A');
    git(kotlinOnly, 'commit', '-q', '-m', 'Kotlin only');
    commitBranch(kotlinOnly, 'kotlin-only-violation', { [`${kotlinSources}/Bad.kt`]: BAD });
    const created = initialize();
    project = created;
    for (const [name, files] of Object.entries({ ...COMMON_BRANCHES, ...branches(created) })) {
      commitBranch(created, name, files);
    }
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
    removeProject(assigned(kotlinOnlyProject, 'kotlinOnlyProject'));
  });
  return {
    get project() {
      return assigned(project, 'project');
    },
    get kotlinOnlyProject() {
      return assigned(kotlinOnlyProject, 'kotlinOnlyProject');
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
