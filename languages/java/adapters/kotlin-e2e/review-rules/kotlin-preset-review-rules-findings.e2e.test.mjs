import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  integrationSuiteFiles,
  publishedFiles,
} from '../test-support/review/kotlin-review-data.mjs';
import {
  ALL_FINDINGS,
  reviewBranchFiles,
  reviewFindings,
} from '../test-support/review/kotlin-review-findings.mjs';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  git,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';
import { helpUriProblems } from '../../../../../shared/reference/test-support/help-uris.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles());
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, map updates, unused option and unused context, and spares the allowed forms', () => {
    const result = diffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(ALL_FINDINGS);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  });

  it('counts the tests of a published module as callers of its public functions', () => {
    commitFromBranch(project, {
      name: 'published',
      from: 'review-rules',
      files: publishedFiles(git(project, 'show', 'main:build.gradle.kts')),
    });

    const result = diffOf(project, 'published');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      ALL_FINDINGS.filter((entry) => entry !== 'unused-option price.discount'),
    );
  });

  it('keeps judging public functions of an unpublished module that has an integration test suite', () => {
    commitFromBranch(project, {
      name: 'integration-suite',
      from: 'review-rules',
      files: integrationSuiteFiles(git(project, 'show', 'main:build.gradle.kts')),
    });

    const result = diffOf(project, 'integration-suite');

    expect(reviewFindings(result.newFindings)).toEqual(ALL_FINDINGS);
  });
});
