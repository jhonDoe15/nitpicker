import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mts';
import {
  createCleanProject,
  metricValue,
  runSnapshot,
} from '../../../typescript/preset/clean-projects/test-support/clean-project.mts';

const FIXTURE_TIMEOUT_MS = 180_000;
const MOCHA_MUTATION_SKIPPED = {
  tool: 'mutation',
  snapshot: 'head',
  rule: 'mutation-unsupported-runner',
  path: '.',
  message:
    "mutation skipped: Stryker's Mocha runner (@stryker-mutator/mocha-runner 10) supports Mocha up to 11, " +
    'and this project uses Mocha 12. Coverage and CRAP still run; use Mocha 11 to get mutation testing.',
};
const plantedOutput = (root) =>
  [
    '',
    'Quality snapshot summary',
    '✖ 1 enforceable finding',
    '  by label: performance 1 · tests 1 (focus with --label <label>)',
    '  eslint-lint/nitpicker/no-unused-dom-environment: This test file runs with jsdom, which the Mocha `require` setup (.mocharc or the test script) registers for every test file through `global-jsdom/register`, but never uses the DOM. Remove `global-jsdom/register` from the Mocha `require` setup (.mocharc or the test script), then import it at the top of the test files that use the DOM, or move those files to a separate Mocha run that registers it. An exception fits only when the file uses the DOM in a way nitpicker cannot see.',
    '    test/greet.js:1:1',
    '    If this is intended, add {"rule":"nitpicker/no-unused-dom-environment","paths":["test/greet.js"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    'By analyzer:',
    '  eslint-lint: 1 enforceable, 0 descriptive',
    'Ran only: eslint-lint. Run nitpicker without --analyzer before you finish.',
    `Full diagnostics: ${root}/reports/snapshot/report.txt`,
    '',
  ].join('\n');
const NON_DOM_TEST = `import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { greet } from '../src/main/features/greeting/domain/greet.js';

describe('greet', () => {
  it('names an empty name', () => {
    assert.deepEqual(greet('  '), { kind: 'empty-name' });
  });
});
`;

describe('JavaScript projects tested without Vitest', () => {
  const temporaryRoots = [];
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function createProject(fixture, files = {}) {
    const fixtureRoot = path.join(import.meta.dirname, '../fixtures', fixture);
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: fixture, files });
    temporaryRoots.push(root);
    return root;
  }

  it.each([
    { fixture: 'node-test-clean', status: 'clean', exit: 0, toolErrors: [] },
    {
      fixture: 'mocha-dom-clean',
      status: 'tool-error',
      exit: 2,
      toolErrors: [MOCHA_MUTATION_SKIPPED],
    },
  ])(
    'runs every test file of $fixture and reports no enforceable finding',
    ({ fixture, status, exit, toolErrors }) => {
      const { exitCode, stderrText, summary, findings, ...run } = runSnapshot(
        createProject(fixture),
      );

      expect(stderrText).toBe('');
      expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
      expect(run.toolErrors).toEqual(toolErrors);
      expect(summary.overallStatus).toBe(status);
      expect(metricValue(findings, 'coverage', 'test-count')).toBe(2);
      expect(metricValue(findings, 'test-runtime', 'summary:analyzedTests')).toBe(2);
      expect(exitCode).toBe(exit);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'reports a Mocha test that never uses the DOM the setup registers',
    () => {
      const root = createProject('mocha-dom-clean', { 'test/greet.js': NON_DOM_TEST });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'eslint-lint']);

      expect(stdoutText).toBe(plantedOutput(root));
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
