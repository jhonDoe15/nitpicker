import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  failingTestFilesOf,
  runArea,
  toolErrors,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const QUALITY_CONFIG = 'languages/typescript/preset/defaults/vitest.quality.config.ts';

const testFile = (expected) =>
  `import { expect, it } from 'vitest';\nimport { pick } from '../src/main/pick';\nit('answers', () => {\n  expect(pick(true)).toBe('${expected}');\n});\n`;

function vitestProject(files) {
  return projects.project({
    'package.json': { name: 'p', private: true, type: 'module' },
    'src/main/pick.ts': PICK_SOURCE,
    ...files,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  projects.remove();
});

describe('coverage on a Vitest project with a failing test file', () => {
  it('keeps the coverage of the passing tests and names the failing file', async () => {
    const root = vitestProject({
      'test/pick.test.ts': testFile('yes'),
      'test/fails.test.ts': testFile('no'),
    });

    const findings = await runArea('coverage', root);

    expect(toolErrors(findings)).toEqual([{ tool: 'tests', rule: 'tests-failed' }]);
    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
    expect(failingTestFilesOf(root)).toEqual(['test/fails.test.ts']);
  });

  it('skips coverage as before when no test passes', async () => {
    const root = vitestProject({ 'test/fails.test.ts': testFile('no') });

    const findings = await runArea('coverage', root);

    expect(toolErrors(findings)).toEqual([{ tool: 'coverage', rule: 'tests-failed' }]);
    expect(findings).toHaveLength(1);
  });

  it('excludes the files listed in NITPICKER_FAILING_TESTS from the quality config, escaped', async () => {
    const root = vitestProject({ 'failing.json': ['test/fails.test.ts', 'test/[id].test.ts'] });
    vi.stubEnv('NITPICKER_FAILING_TESTS', path.join(root, 'failing.json'));

    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'test' },
      path.join(PACKAGE_ROOT, QUALITY_CONFIG),
    );

    expect(loaded.config.test.exclude.slice(-2)).toEqual([
      'test/fails.test.ts',
      String.raw`test/\[id\].test.ts`,
    ]);
  });
});
