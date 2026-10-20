import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../../../core/tooling/tool-resolution.mjs';
import { createRunnerProjects } from '../test-support/runner-project.mjs';
import { runVitest } from './vitest.mjs';

const projects = createRunnerProjects();

afterEach(() => {
  vi.unstubAllEnvs();
  projects.remove();
});

function runProject(files, timeouts) {
  const root = projects.project({ 'package.json': { type: 'module' }, ...files });
  const policy = path.join(root, 'policy.json');
  writeFileSync(policy, JSON.stringify({ tools: { tests: { timeouts } } }));
  vi.stubEnv('NITPICKER_POLICY', policy);
  return {
    root,
    run: runVitest({ projectRoot: root, liveProjectRoot: PACKAGE_ROOT, policyRoot: PACKAGE_ROOT }),
  };
}

describe('Vitest timeout projects', () => {
  it('keeps native project setup and coverage while applying test and hook settings per file', () => {
    const { root, run } = runProject(
      {
        'src/value.mjs': 'export const value = 42;',
        'setup.mjs': 'globalThis.nativeSetup = true;',
        'vitest.config.mjs': `export default { test: { projects: [{ test: { name: 'native', include: ['tests/**/*.test.mjs'], setupFiles: ['./setup.mjs'] } }] } };`,
        'tests/unit/value.test.mjs': `import { test, expect, vi } from 'vitest';
import { value } from '../../src/value.mjs';
test('unit', ({ task }) => { expect(value).toBe(42);
expect(globalThis.nativeSetup).toBe(true); expect(task.timeout).toBe(2000); });`,
        'tests/build/value.test.mjs': `import { test, expect, vi, beforeAll } from 'vitest';
import { value } from '../../src/value.mjs';
beforeAll(async () => { expect(globalThis.nativeSetup).toBe(true);
await new Promise((resolve) => setTimeout(resolve, 100)); });
test('build', ({ task }) => { expect(value).toBe(42);
expect(task.timeout).toBe(6000); });`,
      },
      {
        defaults: { testTimeoutMs: 2000, hookTimeoutMs: 40 },
        projects: {
          build: {
            language: 'java',
            include: ['tests/build/**'],
            testTimeoutMs: 6000,
            hookTimeoutMs: 500,
          },
        },
      },
    );
    expect(
      run.report.testResults.flatMap((result) =>
        result.assertionResults.flatMap((assertion) => assertion.failureMessages),
      ),
    ).toEqual([]);
    expect([run.failed, run.report.numTotalTests]).toEqual([false, 2]);
    expect(existsSync(path.join(root, 'reports/quality/coverage/coverage-final.json'))).toBe(true);
    expect(existsSync(path.join(root, '.nitpicker-diff-test-timeouts.mjs'))).toBe(false);
  });

  it('preserves native project references when no timeout configuration is requested', () => {
    const { run } = runProject({
      'vitest.config.mjs': `export default { test: { projects: ['./vitest.project.config.mjs'] } };`,
      'vitest.project.config.mjs': `export default { test: { include: ['tests/**/*.test.mjs'] } };`,
      'tests/a.test.mjs': `import { test, expect, vi } from 'vitest'; test('a', ({ task }) => { expect(task.timeout).toBe(40000); });`,
    });
    expect([run.failed, run.report.numTotalTests]).toEqual([false, 1]);
  });

  it('rejects external native projects only when timeout configuration is requested', () => {
    expect(() =>
      runProject(
        {
          'vitest.config.mjs': `export default { test: { projects: ['./vitest.project.config.mjs'] } };`,
          'vitest.project.config.mjs': `export default { test: { include: ['tests/**/*.test.mjs'] } };`,
          'tests/a.test.mjs': `import { test } from 'vitest'; test('a', () => {});`,
        },
        { defaults: { testTimeoutMs: 2000 } },
      ),
    ).toThrow('inline Vitest projects');
  });
});
