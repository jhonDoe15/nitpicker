import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint } from '../test-support/views/kotlin-e2e-views.mts';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import {
  BANNED_FILES,
  EXPECTED_BANNED,
  guardFindings,
  printedRule,
  summary,
} from '../test-support/guards/kotlin-guard-data.mts';
import type { DiffResult, KotlinProject } from '../__tests__/kotlin-e2e-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset banned source guards end to end', () => {
  let project: KotlinProject;
  let banned: DiffResult;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'guards-banned', BANNED_FILES);
    banned = diffOf(project, 'guards-banned');
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails every banned form with its own rule', () => {
    expect(summary(banned.newEnforceable)).toEqual(EXPECTED_BANNED);
    expect(banned.newFindings.filter(({ rule }) => rule === 'lint-not-run')).toEqual([]);
  });

  it('ends each finding with the exception sentence of the rule it prints', () => {
    const wrong = guardFindings(banned.newEnforceable)
      .filter(
        (finding) => !finding.message.endsWith(exceptionHint(printedRule(finding), finding.path)),
      )
      .map(({ tool, rule }) => `${tool}/${rule}`);

    expect(wrong).toEqual([]);
  });
});
