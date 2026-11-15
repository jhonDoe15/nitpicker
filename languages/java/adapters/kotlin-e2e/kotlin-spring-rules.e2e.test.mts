import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BAD_FILES,
  PINNED_SPRING_LINES,
  WITHOUT_SELF_CALLS,
  commitBaseThenSpringBranch,
  fixtureBuild,
  springLines,
} from './__tests__/kotlin-spring-fixture.mts';
import {
  diffOf,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from './__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from './__tests__/kotlin-e2e-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin Spring rules end to end', () => {
  let project: KotlinProject;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-')) };
    commitBaseThenSpringBranch(project, fixtureBuild('build.gradle.kts', 'settings.gradle.kts'));
  });
  afterAll(() => {
    if (typeof project === 'object') {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings from the build, with the all-open plugin read from Gradle', () => {
    const result = diffOf(project, 'spring');

    expect(result.failed).toBe(true);
    expect(springLines(result.newEnforceable)).toEqual(PINNED_SPRING_LINES);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'spring', {
      policy: {
        ...kotlinPolicy,
        exceptions: [{ rule: 'pmd/SpringProxySelfCall', glob: BAD_FILES }],
      },
    });

    expect(springLines(result.newEnforceable)).toEqual(WITHOUT_SELF_CALLS);
  });
});
