import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  integrationSuiteFiles,
  publishedFiles,
} from '../test-support/review/kotlin-review-data.mjs';
import { lookupBuild } from '../test-support/review/lookups/kotlin-lookup-data.mjs';
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

const CATCH_ONLY_LOGS_LEFT = { cancellations: ['189'], interrupts: ['99'] };
const INTERNAL_OPTIONS = new Set([
  'unused-option Envelope.retries',
  'unused-option Mailer.retries',
  'unused-option Outbox.limit',
]);

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles(project.root));
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, map updates, unused option, unused context, update across a suspension, lock-order inversion, inconsistently locked property and swallowed cancellation or interrupt, and spares the allowed forms', () => {
    const result = diffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(ALL_FINDINGS);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  });

  it('reports a swallowed catch and a sleep in a suspend test helper once', () => {
    const result = diffOf(project, 'review-rules');
    const on = (file) =>
      result.newEnforceable
        .filter(({ path: found }) => found.endsWith(file))
        .map(({ rule, location }) => `${rule} ${String(location?.line)}`)
        .toSorted();
    const lines = (findings, rule) =>
      findings.filter((entry) => entry.startsWith(`${rule} `)).map((entry) => entry.split(' ')[1]);
    const cancellations = on('/Cancellations.kt');
    const interrupts = on('/Interrupts.kt');
    const pacing = on('/HandlersTest.kt');

    expect(lines(cancellations, 'CatchOnlyLogsOrReturnsDefault')).toEqual(
      CATCH_ONLY_LOGS_LEFT.cancellations,
    );
    expect(lines(interrupts, 'CatchOnlyLogsOrReturnsDefault')).toEqual(
      CATCH_ONLY_LOGS_LEFT.interrupts,
    );
    expect(lines(interrupts, 'catch-log-without-exception')).toEqual([]);
    expect(lines(pacing, 'FixedSleepInTest')).toEqual(['10']);
    expect(lines(pacing, 'detekt.coroutines.SleepInsteadOfDelay')).toEqual([]);
  });

  it('counts the tests of a published module as callers of its public functions', () => {
    commitFromBranch(project, {
      name: 'published',
      from: 'review-rules',
      files: publishedFiles(lookupBuild(git(project, 'show', 'main:build.gradle.kts'))),
    });

    const result = diffOf(project, 'published');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      ALL_FINDINGS.filter((entry) => entry !== 'unused-option price.discount'),
    );
  });

  it('withholds internal but judges public functions of an unpublished module with an integration suite', () => {
    commitFromBranch(project, {
      name: 'integration-suite',
      from: 'review-rules',
      files: integrationSuiteFiles(lookupBuild(git(project, 'show', 'main:build.gradle.kts'))),
    });

    const result = diffOf(project, 'integration-suite');

    expect(reviewFindings(result.newFindings)).toEqual(
      [
        ...ALL_FINDINGS.filter((entry) => !INTERNAL_OPTIONS.has(entry)),
        'unused-option callers-not-analyzed',
      ].sort(),
    );
  });
});
