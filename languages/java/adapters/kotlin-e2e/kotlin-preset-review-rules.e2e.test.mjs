import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_REVIEW_FINDINGS,
  REVIEW_RULE_FILES,
  runtimeSerializationFiles,
} from './test-support/review/kotlin-review-data.mjs';
import {
  commitBranch,
  commitFromBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from './test-support/kotlin-e2e-project.mjs';

const REVIEW_TOOLS = new Set(['pmd']);
const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';

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
    commitBranch(project, 'review-rules', REVIEW_RULE_FILES);
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, unused option and unused context, and spares the allowed forms', () => {
    const result = diffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(EXPECTED_REVIEW_FINDINGS);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual([
      'ExhaustiveEnumPredicate isLive',
      'ExhaustiveEnumPredicate isOpen',
      'ExhaustiveEnumPredicate isSettled',
      'ExhaustiveEnumPredicate weight',
      'ForwardingMethodAlias Cart.count',
      'SingularAndPluralMember Query.tags',
      'StaticForwardingWrapper absOf',
      'StaticForwardingWrapper total',
    ]);
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
