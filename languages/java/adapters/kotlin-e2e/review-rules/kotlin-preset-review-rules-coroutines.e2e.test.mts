import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  COROUTINE_FILES,
  EXPECTED_COROUTINE_FINDINGS,
} from '../test-support/review/concurrency/kotlin-coroutine-data.mts';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import { assigned } from '../test-support/views/assigned.mts';

const COROUTINE_RULES = new Set(['SuspendFunInFinallySection', 'ChildCoroutineOutlivesResource']);

function coroutineFindings(findings: Finding[]) {
  return findings
    .filter(({ tool, rule }) => tool === 'kotlin-source' && COROUTINE_RULES.has(rule))
    .map(({ rule, symbol }) => `${rule} ${String(symbol)}`)
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset coroutine lifetime rules end to end', () => {
  let project: KotlinProject | undefined;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'coroutine-lifetimes', COROUTINE_FILES);
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });

  it('fails suspending cleanup and a child coroutine that outlives its use block, and spares the allowed forms', () => {
    const result = diffOf(assigned(project, 'project'), 'coroutine-lifetimes');

    expect(result.failed).toBe(true);
    expect(coroutineFindings(result.newEnforceable)).toEqual(EXPECTED_COROUTINE_FINDINGS);
    expect(
      result.newEnforceable.filter(
        ({ rule, path: file }) => rule === 'CoroutineEscapesTest' && file.endsWith('CopierTest.kt'),
      ),
    ).toEqual([]);
  });

  it('lifts the coroutine rules for some paths with the exception their messages name', () => {
    const result = diffOf(assigned(project, 'project'), 'coroutine-lifetimes', {
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
