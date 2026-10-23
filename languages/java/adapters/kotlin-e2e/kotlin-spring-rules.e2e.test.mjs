import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BAD_FILES,
  commitSpringProject,
  fixtureBuild,
  recordedFindings,
  springLines,
} from './__tests__/kotlin-spring-fixture.mjs';
import {
  diffOf,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from './test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin Spring rules end to end', () => {
  let project;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-')) };
    commitSpringProject(project, fixtureBuild('build.gradle.kts', 'settings.gradle.kts'));
  });
  afterAll(() => {
    if (project !== undefined) {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings from the build, with the all-open plugin read from Gradle', () => {
    const result = diffOf(project, 'spring');

    expect(result.failed).toBe(true);
    expect(springLines(result.newEnforceable)).toEqual(springLines(recordedFindings()));
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'spring', {
      policy: {
        ...kotlinPolicy,
        exceptions: [{ rule: 'pmd/SpringProxySelfCall', glob: BAD_FILES }],
      },
    });

    expect(springLines(result.newEnforceable)).toEqual(
      springLines(recordedFindings().filter(({ rule }) => rule !== 'SpringProxySelfCall')),
    );
  });
});
