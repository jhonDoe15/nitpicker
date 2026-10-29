import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BAD_FILES,
  PINNED_SPRING_LINES,
  WITHOUT_SELF_CALLS,
  commitBaseThenSpringBranch,
  springLines,
} from '../../__tests__/kotlin-spring-fixture.mjs';
import {
  kotlinE2eEnabled,
  kotlinPolicy,
  mavenDiffRunner,
  removeProject,
} from '../test-support/kotlin-maven-project.mjs';

const mavenDiffOf = mavenDiffRunner(process.env.NITPICKER_MAVEN);
const POM = path.resolve(
  import.meta.dirname,
  '../../../../maven/fixtures/kotlin-spring-project/pom.xml',
);

describe.skipIf(!kotlinE2eEnabled)('Kotlin Spring rules on a Maven project end to end', () => {
  let project;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-maven-')) };
    commitBaseThenSpringBranch(project, { 'pom.xml': readFileSync(POM, 'utf8') });
  });
  afterAll(() => {
    if (project !== undefined) {
      removeProject(project);
    }
  });

  it('reports what the Gradle build of the same sources reports, with the all-open plugin read from the POM', () => {
    const result = mavenDiffOf(project, 'spring');

    expect(result.failed).toBe(true);
    expect(springLines(result.newEnforceable)).toEqual(PINNED_SPRING_LINES);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = mavenDiffOf(project, 'spring', {
      policy: {
        ...kotlinPolicy,
        exceptions: [{ rule: 'pmd/SpringProxySelfCall', glob: BAD_FILES }],
      },
    });

    expect(springLines(result.newEnforceable)).toEqual(WITHOUT_SELF_CALLS);
  });
});
