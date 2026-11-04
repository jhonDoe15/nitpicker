import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';
import { ALLOWED_FILES, GUARD_ROOT, summary } from '../test-support/guards/kotlin-guard-data.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset allowed source forms end to end', () => {
  let project;
  let allowed;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'guards-allowed', ALLOWED_FILES);
    allowed = diffOf(project, 'guards-allowed');
  });
  afterAll(() => {
    removeProject(project);
  });

  it('lets every allowed form through, the composition root reading the environment among them', () => {
    expect(summary(allowed.newFindings)).toEqual([]);
    expect(
      allowed.newEnforceable.filter(({ path: file }) => file.endsWith(`${GUARD_ROOT}/App.kt`)),
    ).toEqual([]);
  });
});
