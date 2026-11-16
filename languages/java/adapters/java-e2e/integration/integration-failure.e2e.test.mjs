import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
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
    runs.failing = collectJavaFindings(project, { gradle, policy });
  }, 180_000);

  it('name the failing cases of a checked integration task in a tests error', () => {
    expect(
      runs.failing
        .filter(({ rule }) => rule === 'tests-failed')
        .map(({ tool, message }) => `${tool} ${message}`),
    ).toEqual([
      'tests 1 test fails; coverage, CRAP and mutation were skipped, the other checks ran. ' +
        'Fix the tests and rerun:\n' +
        '  demo/GreeterIT.java:10 > demo.GreeterIT.saysGoodbye: expected: <Nope> but was: <Goodbye, Ada>',
    ]);
  });
});
