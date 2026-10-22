import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { codeSmellRules } from '../test-support/code-smell-rules.mjs';
import { expectedViolations, reportedViolations } from '../test-support/violation-markers.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'code-smells-project');

describe.skipIf(!enabled)('code smell rules on a Gradle project', () => {
  let projectRoot;
  const checkedRules = new Set([
    ...codeSmellRules().map(({ name }) => name),
    'AvoidDuplicateLiterals',
  ]);

  beforeAll(() => {
    projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-e2e-')), 'smells');
    cpSync(fixture, projectRoot, { recursive: true });
    const result = spawnSync(
      gradle,
      ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd', 'nitpickerJava'],
      { cwd: projectRoot, encoding: 'utf8', timeout: 180_000 },
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

  it.each(['main', 'test'])('reports exactly the violations marked in %s sources', (sourceSet) => {
    const sourceRoot = path.join(projectRoot, 'src', sourceSet, 'java');
    expect(
      reportedViolations(
        path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'),
        sourceRoot,
        (rule) => checkedRules.has(rule),
      ),
    ).toEqual(expectedViolations(sourceRoot));
  });
});
