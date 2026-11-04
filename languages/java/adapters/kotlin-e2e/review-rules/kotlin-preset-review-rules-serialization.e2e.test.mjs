import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_REVIEW_FINDINGS,
  REVIEW_RULE_FILES,
  runtimeSerializationFiles,
} from '../test-support/review/kotlin-review-data.mjs';
import { reviewFindings } from '../test-support/review/kotlin-review-findings.mjs';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rule serialization end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', REVIEW_RULE_FILES);
  });
  afterAll(() => {
    removeProject(project);
  });

  it('skips data classes when a serialization library is only on the runtime classpath', () => {
    const build = readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8');
    commitFromBranch(project, {
      name: 'runtime-serialization',
      from: 'review-rules',
      files: runtimeSerializationFiles(build),
    });

    const result = diffOf(project, 'runtime-serialization');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      EXPECTED_REVIEW_FINDINGS.filter((entry) => entry !== 'unused-option Envelope.retries'),
    );
  });
});
