import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  enabled,
  fixtures,
  gradle,
  policy,
  useIntegrationProjects,
} from '../__tests__/integration-support.mjs';

describe.skipIf(!enabled)('a failing integration task wired to check', () => {
  const projectOf = useIntegrationProjects();
  const runs = {};
  beforeAll(() => {
    const project = projectOf(path.join(fixtures, 'integration-tasks'), { sources: true });
    const test = path.join(project, 'src/test/java/demo/GreeterIT.java');
    writeFileSync(test, readFileSync(test, 'utf8').replace('Goodbye, Ada', 'Nope'));
    runs.failure = collectJavaFindings(project, { gradle, policy }).find(
      ({ rule }) => rule === 'tests-failed',
    )?.message;
  }, 180_000);

  it('fail the build naming the failing cases of a checked integration task', () => {
    expect(runs.failure).toEqual(
      '1 test fails; coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
        '  demo/GreeterIT.java:10 > demo.GreeterIT.saysGoodbye: expected: <Nope> but was: <Goodbye, Ada>',
    );
  });
});
