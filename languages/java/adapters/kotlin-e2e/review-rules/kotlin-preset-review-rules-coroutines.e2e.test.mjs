import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COROUTINE_FILES,
  EXPECTED_COROUTINE_FINDINGS,
} from '../test-support/review/kotlin-coroutine-data.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

const COROUTINE_RULES = new Set(['SuspendFunInFinallySection', 'ChildCoroutineOutlivesResource']);

function coroutineFindings(findings) {
  return findings
    .filter(({ tool, rule }) => tool === 'kotlin-source' && COROUTINE_RULES.has(rule))
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coroutine lifetime rules end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'coroutine-lifetimes', COROUTINE_FILES);
  });
  afterAll(() => {
    removeProject(project);
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
