import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  FULL_COVERAGE,
  INTEGRATION_FIXTURES,
  INTEGRATION_POLICY,
  WITHOUT_FAREWELL,
  coverage,
  moveIntegrationTest,
  mutations,
  slowTests,
  useIntegrationProjects,
} from '../test-support/integration-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const policy = INTEGRATION_POLICY;
const fixtures = INTEGRATION_FIXTURES;
const projectOf = useIntegrationProjects();

describe.skipIf(!enabled)('integration tests left out of check or failing on Gradle', () => {
  const runs = {};
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-unwired'), { sources: true });
    moveIntegrationTest(project);
    runs.unwired = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-skippable'), { sources: true });
    runs.beforeSkip = collectJavaFindings(project, { gradle, policy });
    writeFileSync(path.join(project, 'skip-integration-tests'), '');
    runs.afterSkip = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-tasks'), { sources: true });
    const test = path.join(project, 'src/test/java/demo/GreeterIT.java');
    writeFileSync(test, readFileSync(test, 'utf8').replace('Goodbye, Ada', 'Nope'));
    runs.failing = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  it('leave a suite alone that the project does not wire to check', () => {
    expect(coverage(runs.unwired)).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(runs.unwired)).toEqual([]);
  });

  it('count a skipped integration task nowhere, not even from its earlier run', () => {
    expect(coverage(runs.beforeSkip)).toEqual(FULL_COVERAGE);
    expect(coverage(runs.afterSkip)).toEqual(WITHOUT_FAREWELL);
    expect(slowTests(runs.afterSkip)).toEqual([]);
    expect(mutations(runs.afterSkip)).toEqual([
      'mutant-nocoverage Greeter|farewell(LString;)LString;|EmptyObjectReturnValsMutator|replaced return value with "" for Greeter::farewell#1',
      'mutation-summary status:NoCoverage',
      'mutation-summary status:Killed',
    ]);
  });

  it('report the failing cases of a checked integration task and keep the other checks', () => {
    const failures = runs.failing.filter(({ rule }) => rule === 'tests-failed');

    expect(mutations(runs.failing)).toEqual([]);
    expect(failures.map(({ tool, message }) => `${tool} ${message}`)).toEqual([
      'tests ' +
        '1 test fails; coverage, CRAP and mutation were skipped, the other checks ran. Fix the tests and rerun:\n' +
        '  demo/GreeterIT.java:10 > demo.GreeterIT.saysGoodbye: expected: <Nope> but was: <Goodbye, Ada>',
    ]);
  });
});
