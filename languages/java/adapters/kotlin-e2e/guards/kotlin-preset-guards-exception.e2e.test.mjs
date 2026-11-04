import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';
import {
  BANNED_FILES,
  EXPECTED_BANNED,
  GUARD_ROOT,
  summary,
} from '../test-support/guards/kotlin-guard-data.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset source guard exceptions end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'guards-banned', BANNED_FILES);
  });
  afterAll(() => {
    removeProject(project);
  });

  it('lifts a source rule for the paths of an exception only', () => {
    const result = diffOf(project, 'guards-banned', {
      policy: {
        ...kotlinPolicy,
        exceptions: [{ rule: 'kotlin-source/MutableModuleState', glob: `${GUARD_ROOT}/State.kt` }],
      },
    });

    expect(summary(result.newEnforceable)).toEqual(
      EXPECTED_BANNED.filter((entry) => entry !== 'kotlin-source/MutableModuleState State.kt'),
    );
  });
});
