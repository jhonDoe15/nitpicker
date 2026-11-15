import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  integrationSuiteFiles,
  publishedFiles,
} from '../test-support/review/kotlin-build-files-data.mts';
import { ARCHIVE_FILE } from '../test-support/review/kotlin-review-data.mts';
import { lookupBuild } from '../test-support/review/lookups/kotlin-lookup-data.mts';
import {
  ALL_FINDINGS,
  reviewBranchFiles,
  reviewFindings,
} from '../test-support/review/kotlin-review-findings.mts';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  git,
  initializeProject,
  kotlinE2eEnabled,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { helpUriProblems as untypedHelpUriProblems } from '../../../../../shared/reference/test-support/help-uris.mjs';

const helpUriProblems: (findings: readonly Finding[]) => string[] = untypedHelpUriProblems;

const CATCH_ONLY_LOGS_LEFT = { cancellations: ['189'], interrupts: ['99'] };
const INTERNAL_OPTIONS = new Set([
  'unused-option Envelope.retries',
  'unused-option Mailer.retries',
  'unused-option Outbox.limit',
]);

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules end to end', () => {
  let project: KotlinProject | undefined;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles(project.root));
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });

  it('fails the sleeps, float comparisons, enum predicates, wrapper, plural member, map updates, unused option, unused context, update across a suspension, lock-order inversion, inconsistently locked property and swallowed cancellation or interrupt, blocking coroutine calls and timeout blocks, and spares the allowed forms', () => {
    const result = diffOf(assigned(project, 'project'), 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(ALL_FINDINGS);
    expect(
      result.newEnforceable
        .filter(
          ({ tool, rule, path: file }) =>
            tool === 'detekt' && file === ARCHIVE_FILE && rule.endsWith('InjectDispatcher'),
        )
        .map(({ rule }) => rule),
    ).toEqual([]);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  });

  it('reports a swallowed catch and a sleep in a suspend test helper once', () => {
    const result = diffOf(assigned(project, 'project'), 'review-rules');
    const on = (file: string) =>
      result.newEnforceable
        .filter(({ path: found }) => found.endsWith(file))
        .map(({ rule, location }) => `${rule} ${String(location?.line)}`)
        .toSorted();
    const lines = (findings: string[], rule: string) =>
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
    commitFromBranch(assigned(project, 'project'), {
      name: 'published',
      from: 'review-rules',
      files: publishedFiles(
        lookupBuild(git(assigned(project, 'project'), 'show', 'main:build.gradle.kts')),
      ),
    });

    const result = diffOf(assigned(project, 'project'), 'published');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      ALL_FINDINGS.filter((entry) => entry !== 'unused-option price.discount'),
    );
  });

  it('withholds internal but judges public functions of an unpublished module with an integration suite', () => {
    commitFromBranch(assigned(project, 'project'), {
      name: 'integration-suite',
      from: 'review-rules',
      files: integrationSuiteFiles(
        lookupBuild(git(assigned(project, 'project'), 'show', 'main:build.gradle.kts')),
      ),
    });

    const result = diffOf(assigned(project, 'project'), 'integration-suite');

    expect(reviewFindings(result.newFindings)).toEqual(
      [
        ...ALL_FINDINGS.filter((entry) => !INTERNAL_OPTIONS.has(entry)),
        'unused-option callers-not-analyzed',
      ].sort(),
    );
  });
});
