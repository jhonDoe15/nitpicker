import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COROUTINE_FILES,
  EXPECTED_COROUTINE_FINDINGS,
} from './test-support/review/kotlin-coroutine-data.mjs';
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
import { helpUriProblems } from '../../../../shared/reference/test-support/help-uris.mjs';

const REVIEW_TOOLS = new Set(['pmd']);
const COROUTINE_RULES = new Set(['SuspendFunInFinallySection', 'ChildCoroutineOutlivesResource']);
const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';

function reviewFindings(findings) {
  return findings
    .filter(({ tool, rule }) => REVIEW_TOOLS.has(tool) || rule === 'unused-option')
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}

function coroutineFindings(findings) {
  return findings
    .filter(({ tool, rule }) => tool === 'kotlin-source' && COROUTINE_RULES.has(rule))
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rules end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', REVIEW_RULE_FILES);
    commitBranch(project, 'coroutine-lifetimes', COROUTINE_FILES);
  });
  afterAll(() => {
    removeProject(project);
  });

  it('fails the sleeps, enum predicates, wrapper, plural member, unused option and unused context, and spares the allowed forms', () => {
    const result = diffOf(project, 'review-rules');

    expect(result.failed).toBe(true);
    expect(reviewFindings(result.newEnforceable)).toEqual(EXPECTED_REVIEW_FINDINGS);
    expect(helpUriProblems(result.newFindings)).toEqual([]);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'pmd/ClassLoadEffect', glob: 'src/main/kotlin/demo/orders/Inventory.kt' },
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual([
      'ExhaustiveEnumPredicate isLive',
      'ExhaustiveEnumPredicate isOpen',
      'ExhaustiveEnumPredicate isSettled',
      'ExhaustiveEnumPredicate weight',
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

  it('fails suspending cleanup and a child coroutine that outlives its use block, and spares the allowed forms', () => {
    const result = diffOf(project, 'coroutine-lifetimes');

    expect(result.failed).toBe(true);
    expect(coroutineFindings(result.newEnforceable)).toEqual(EXPECTED_COROUTINE_FINDINGS);
    expect(
      result.newEnforceable.filter(
        ({ rule, path: file }) => rule === 'CoroutineEscapesTest' && file.endsWith('CopierTest.kt'),
      ),
    ).toEqual([]);
  });

  it('lifts the coroutine rules for some paths with the exception their messages name', () => {
    const result = diffOf(project, 'coroutine-lifetimes', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          {
            rule: 'kotlin-source/SuspendFunInFinallySection',
            glob: 'src/main/kotlin/demo/lifetimes/Teardown.kt',
          },
        ],
      },
    });

    expect(coroutineFindings(result.newEnforceable)).toEqual(
      EXPECTED_COROUTINE_FINDINGS.filter((entry) =>
        entry.startsWith('ChildCoroutineOutlivesResource'),
      ),
    );
  });
});
