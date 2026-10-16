import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PICK_SOURCE,
  createRunnerProjects,
  runArea,
} from '../test-runners/test-support/runner-project.mjs';

const projects = createRunnerProjects();
const WAIT = 'await new Promise((resolve) => setTimeout(resolve, 1500));';
const TSCONFIG = {
  compilerOptions: { strict: true, esModuleInterop: true, types: ['jest', 'node'] },
};
let policyDirectory;

const RUNNERS = [
  {
    runner: 'vitest',
    identity: 'test:waits',
    files: {
      'package.json': { name: 'p', private: true, type: 'module' },
      'test/slow.test.ts': `import { expect, it } from 'vitest';\nit('waits', async () => {\n  ${WAIT}\n  expect(1).toBe(1);\n});\n`,
    },
  },
  {
    runner: 'jest',
    identity: 'test:waits',
    files: {
      'package.json': {
        name: 'p',
        private: true,
        scripts: { test: 'jest' },
        jest: { preset: 'ts-jest', testEnvironment: 'node' },
      },
      'tsconfig.json': TSCONFIG,
      'test/slow.test.ts': `it('waits', async () => {\n  ${WAIT}\n  expect(1).toBe(1);\n});\n`,
    },
  },
  {
    runner: 'node:test',
    identity: 'test:waits',
    files: {
      'package.json': { name: 'p', type: 'module', scripts: { test: 'node --test' } },
      'test/slow.test.ts': `import { it } from 'node:test';\nit('waits', async () => {\n  ${WAIT}\n});\n`,
    },
  },
  {
    runner: 'mocha',
    identity: 'test:slow waits',
    files: {
      'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
      'test/slow.test.ts': `describe('slow', () => {\n  it('waits', async () => {\n    ${WAIT}\n  });\n});\n`,
    },
  },
];

beforeEach(() => {
  policyDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-slow-policy-'));
  writeFileSync(
    path.join(policyDirectory, 'policy.json'),
    JSON.stringify({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: { unitTestSeconds: 0.7 },
    }),
  );
  vi.stubEnv('NITPICKER_POLICY', path.join(policyDirectory, 'policy.json'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(policyDirectory, { recursive: true, force: true });
  projects.remove();
});

describe('slow tests on each test runner', () => {
  it.each(RUNNERS)(
    'fails a test that waits past the unit budget on $runner',
    async ({ files, identity }) => {
      const root = projects.project({ 'src/main/pick.ts': PICK_SOURCE, ...files });

      const findings = await runArea('coverage', root);

      expect(
        findings
          .filter(({ rule }) => rule === 'slow-test')
          .map(({ tool, path: file, identity: id, classification }) => [
            tool,
            file,
            id,
            classification,
          ]),
      ).toEqual([['coverage', 'test/slow.test.ts', identity, 'enforceable']]);
    },
  );
});
