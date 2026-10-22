import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { createCleanProject, metricValue, runSnapshot } from './test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/jest-dom-clean');
const FIXTURE_TIMEOUT_MS = 180_000;
const PLANTED_TEST = 'src/main/features/greeting/__tests__/sum.tsx';
const PLANTED_OUTPUT = [
  'Nitpicker quality snapshot',
  'Status: violations',
  'Enforceable findings: 2',
  'Descriptive findings: 0',
  'Tool errors: 0',
  '',
  'Per-tool counts:',
  'eslint-lint: total=2 enforceable=2 descriptive=0',
  '',
  'Enforceable findings:',
  `eslint-lint/nitpicker/no-unused-dom-environment ${PLANTED_TEST}:1 This test file runs in jsdom, the project default, but never uses the DOM. Add \`/** @jest-environment node */\` here, or default to node and add \`/** @jest-environment jsdom */\` to DOM tests. An exception fits only when the file uses the DOM in a way nitpicker cannot see. If this is intended, add {"rule":"nitpicker/no-unused-dom-environment","paths":["${PLANTED_TEST}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
  `eslint-lint/nitpicker/test-must-use-production-runtime ${PLANTED_TEST}:1 This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in a file Jest does not run as a test: not named *.test.* or *.spec.*, not under __tests__, and outside the testMatch or testRegex of the Jest config. If this is intended, add {"rule":"nitpicker/test-must-use-production-runtime","paths":["${PLANTED_TEST}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
  '',
].join('\n');

describe('a Jest and React Testing Library project with __tests__ folders', () => {
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

  function createProject(files = {}) {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'jest-dom', files });
    temporaryRoots.push(root);
    return root;
  }

  it(
    'passes `nitpicker --all` and runs the test files Jest finds through its config',
    () => {
      const { exitCode, stderrText, summary, toolErrors, findings } = runSnapshot(createProject());

      expect(stderrText).toBe('');
      expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
      expect(toolErrors).toEqual([]);
      expect(summary.overallStatus).toBe('clean');
      expect(metricValue(findings, 'coverage', 'test-count')).toBe(3);
      expect(metricValue(findings, 'test-runtime', 'summary:analyzedTests')).toBe(2);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'treats a __tests__ file without a test suffix as a jsdom test file',
    () => {
      const root = createProject({
        [PLANTED_TEST]: [
          'function sum(left: number, right: number): number {',
          '  return left + right;',
          '}',
          '',
          "it('adds two numbers', () => {",
          '  expect(sum(1, 2)).toBe(3);',
          '});',
          '',
        ].join('\n'),
      });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'eslint-lint']);

      expect(stdoutText).toBe(PLANTED_OUTPUT);
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
