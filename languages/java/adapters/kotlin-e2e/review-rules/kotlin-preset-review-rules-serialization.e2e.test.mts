import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeSerializationFiles } from '../test-support/review/kotlin-build-files-data.mts';
import {
  ALL_FINDINGS,
  reviewBranchFiles,
  reviewFindings,
} from '../test-support/review/kotlin-review-findings.mts';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import { assigned } from '../test-support/views/assigned.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rule serialization end to end', () => {
  let project: KotlinProject | undefined;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles(project.root));
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });

  it('skips data classes when a serialization library is only on the runtime classpath', () => {
    const build = readFileSync(
      path.join(assigned(project, 'project').root, 'build.gradle.kts'),
      'utf8',
    );
    commitFromBranch(assigned(project, 'project'), {
      name: 'runtime-serialization',
      from: 'review-rules',
      files: runtimeSerializationFiles(build),
    });

    const result = diffOf(assigned(project, 'project'), 'runtime-serialization');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      ALL_FINDINGS.filter((entry) => entry !== 'unused-option Envelope.retries'),
    );
  });
});
