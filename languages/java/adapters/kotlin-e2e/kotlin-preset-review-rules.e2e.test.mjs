import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SWALLOWED_CANCELLATIONS } from './test-support/review/swallowed/kotlin-cancellation-data.mjs';
import {
  EXPECTED_REVIEW_FINDINGS as RULE_FINDINGS,
  integrationSuiteFiles,
  publishedFiles,
  REVIEW_RULE_FILES,
  runtimeSerializationFiles,
} from './test-support/review/kotlin-review-data.mjs';
import { PLURAL_FINDINGS } from './test-support/review/kotlin-plural-data.mjs';
import {
  GLOBAL_STATE_FILES,
  GLOBAL_STATE_FINDINGS,
} from './test-support/review/kotlin-global-state-data.mjs';
import {
  mapUpdateFiles,
  MAP_UPDATE_FINDINGS,
} from './test-support/review/kotlin-map-update-data.mjs';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  git,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from './test-support/kotlin-e2e-project.mjs';
import { helpUriProblems } from '../../../../shared/reference/test-support/help-uris.mjs';

const REVIEW_TOOLS = new Set(['pmd']);
const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';
const CATCH_ONLY_LOGS_LEFT = { cancellations: ['189'], interrupts: ['99'] };
const ALL_FINDINGS = [...RULE_FINDINGS, ...MAP_UPDATE_FINDINGS, ...GLOBAL_STATE_FINDINGS].sort();

function reviewFindings(findings) {
  return findings
    .filter(({ tool, rule }) => REVIEW_TOOLS.has(tool) || rule === 'unused-option')
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', {
      ...REVIEW_RULE_FILES,
      ...mapUpdateFiles(),
      ...GLOBAL_STATE_FILES,
    });
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, map updates, unused option, unused context and swallowed cancellation or interrupt, and spares the allowed forms', () => {
    const result = diffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(ALL_FINDINGS);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/GlobalStateLeakInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'pmd/MockedSubjectInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/StaticMockOfProjectType', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'pmd/SwallowedInterrupt', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'pmd/ClassLoadEffect', glob: 'src/main/kotlin/demo/orders/Inventory.kt' },
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual(
      [
        'ExhaustiveEnumPredicate isHandedOver',
        'ExhaustiveEnumPredicate isLive',
        'ExhaustiveEnumPredicate isOpen',
        'ExhaustiveEnumPredicate isPending',
        'ExhaustiveEnumPredicate isSettled',
        'ExhaustiveEnumPredicate weight',
        ...PLURAL_FINDINGS,
        'StaticForwardingWrapper absOf',
        'StaticForwardingWrapper total',
        ...MAP_UPDATE_FINDINGS,
        ...SWALLOWED_CANCELLATIONS,
      ].sort(),
    );
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

  it('skips data classes when a serialization library is only on the runtime classpath', () => {
    const build = readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8');
    commitFromBranch(project, {
      name: 'runtime-serialization',
      from: 'review-rules',
      files: runtimeSerializationFiles(build),
    });

    const result = diffOf(project, 'runtime-serialization');

    expect(reviewFindings(result.newEnforceable)).toEqual(
      ALL_FINDINGS.filter((entry) => entry !== 'unused-option Envelope.retries'),
    );
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
