import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { enabled, gradle } from '../__tests__/spring-project.mts';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/spring-plain-jpa-project');

describe.skipIf(!enabled)('Spring rules on a Spring project without Spring Data', () => {
  let projectRoot: string | undefined;

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-plain-jpa-')), 'shop');
    cpSync(fixture, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 180_000,
      },
    );
    if (result.status !== 0) {
      throw new Error(`Gradle failed: ${result.stderr}`);
    }
  }, 300_000);

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('leaves plain entity manager code to IoCallInLoop and reports no Spring Data or bean rule', () => {
    const sarif = path.join(String(projectRoot), 'build', 'nitpicker', 'pmd.sarif');
    const [run] = listOf(fieldOf(parseJson(readFileSync(sarif, 'utf8')), 'runs'));
    const rules = listOf(fieldOf(run, 'results')).map((result) =>
      textOf(fieldOf(result, 'ruleId')),
    );

    expect(rules.filter((rule) => /^(SpringData|SpringTypedConfiguration)/u.test(rule))).toEqual(
      [],
    );
    expect(rules.filter((rule) => rule === 'IoCallInLoop')).toEqual(['IoCallInLoop']);
  });
});
