import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../java-diff.mjs';
import { expectedViolations, reportedViolations } from '../fixtures/violation-markers.mjs';
import { codeSmellRules } from './code-smell-rules.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'code-smells-project');
const CHECKED_RULES = new Set([
  ...codeSmellRules().map(({ name }) => name),
  'AvoidDuplicateLiterals',
]);

describe.skipIf(!enabled)('code smell rules on a Gradle project', () => {
  let projectRoot;

  beforeAll(
    () => {
      projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-smells-')), 'smells');
      cpSync(fixture, projectRoot, { recursive: true });
      const result = spawnSync(
        gradle,
        ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd', 'nitpickerJava'],
        { cwd: projectRoot, encoding: 'utf8', timeout: 15 * 60 * 1000 },
      );
      if (result.status !== 0) {
        throw new Error(`Gradle failed: ${result.stderr}`);
      }
    },
    16 * 60 * 1000,
  );

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it.each(['main', 'test'])('reports exactly the violations marked in %s sources', (sourceSet) => {
    const sourceRoot = path.join(projectRoot, 'src', sourceSet, 'java');
    const sarif = path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif');
    expect(reportedViolations(sarif, sourceRoot, (rule) => CHECKED_RULES.has(rule))).toEqual(
      expectedViolations(sourceRoot),
    );
  });
});
