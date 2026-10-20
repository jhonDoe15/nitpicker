import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { createRunnerProjects } from './test-support/runner-project.mjs';
import { runJest } from './jest/jest.mjs';
import { runMocha } from './mocha/mocha.mjs';
import { runNodeTest } from './node-test/node-test.mjs';
import { TEST_CONSOLE_REPORT_PATH } from '../quality-areas/reporting/test-report.mjs';

const projects = createRunnerProjects();
afterEach(() => {
  projects.remove();
});

const RUNNERS = [
  { runner: 'jest', run: runJest, setup: '' },
  { runner: 'mocha', run: runMocha, setup: "const { it } = require('mocha');" },
  { runner: 'node', run: runNodeTest, setup: "const { it } = require('node:test');" },
];

describe.each(RUNNERS)('$runner console reports', ({ run, setup }) => {
  it.each([false, true])(
    'captures warnings with rerun=%s and removes stale entries',
    async (rerun) => {
      const file = 'test/value.test.js';
      const root = projects.project({
        'package.json': { name: 'console-fixture', private: true },
        'src/value.js': 'exports.value = () => 42;',
        [file]: `${setup}
const assert = require('node:assert/strict');
const { value } = require('../src/value');
it('warns', () => {
  console.warn('known console warning');
  console.log('ordinary output');
  assert.equal(value(), 42);
});`,
      });
      const consolePath = path.join(root, TEST_CONSOLE_REPORT_PATH);
      mkdirSync(path.dirname(consolePath), { recursive: true });
      writeFileSync(consolePath, JSON.stringify({ entries: [{ messages: ['stale'] }] }));
      const result = await run(
        {
          projectRoot: root,
          liveProjectRoot: PACKAGE_ROOT,
          toolRoot: PACKAGE_ROOT,
          policyRoot: PACKAGE_ROOT,
          analyzerName: 'coverage',
          kind: 'coverage',
          ...(rerun ? { rerun: { files: [path.join(root, file)], namePattern: '^warns$' } } : {}),
        },
        { environment: {}, nodeArguments: [], arguments_: [] },
      );
      expect(result.failed).toBe(false);
      const report = JSON.parse(readFileSync(path.join(root, TEST_CONSOLE_REPORT_PATH), 'utf8'));
      expect(report.entries.flatMap(({ messages }) => messages)).toEqual(['known console warning']);
      expect(report.entries[0].file).toBe(path.join(root, file));
    },
  );
});
