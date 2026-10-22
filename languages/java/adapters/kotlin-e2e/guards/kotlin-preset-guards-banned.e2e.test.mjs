import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';
import {
  BANNED_FILES,
  EXPECTED_BANNED,
  guardFindings,
  printedRule,
  summary,
} from './kotlin-guard-data.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset banned source guards end to end', () => {
  let project;
  let banned;

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
    expect(banned.newFindings.some(({ rule }) => rule === 'lint-not-run')).toBe(false);
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
