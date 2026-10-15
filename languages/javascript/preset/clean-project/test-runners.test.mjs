import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  createCleanProject,
  readReport,
  runNitpicker,
} from '../../../typescript/preset/clean-projects/test-support/clean-project.mjs';

const FIXTURE_TIMEOUT_MS = 300_000;
const SOURCE_FILES = 2;
const SHOUT_SOURCE = `/**
 * @param {string} text
 * @returns {string}
 */
export function shout(text) {
  return \`\${text.toUpperCase()}!\`;
}
`;
const INDEX_WITH_SHOUT = `export { greet, totalLength } from './domain/greet.js';
export { shout } from './domain/shout.js';
`;
const MIXED_PACKAGE_JSON = `${JSON.stringify({
  name: 'mixed-fixture',
  private: true,
  type: 'module',
  devDependencies: { jest: '30.5.2' },
})}\n`;
const MIXED_RUNNERS_MESSAGE =
  'nitpicker failed: nitpicker.config.json: found several test runners (Jest: "jest" in package.json dependencies; node:test: test/greeting.test.js imports node:test). Choose one with "tools": { "tests": { "runner": "vitest" | "jest" | "node-test" } } in nitpicker.config.json.\n';
const FAILING_COVERAGE_TOOL_ERRORS = (assertionLine) => [
  {
    tool: 'coverage',
    rule: 'tests-failed',
    path: 'test/failing.test.js',
    identity: 'tests-failed',
    message: `1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/failing.test.js > checks greet: ${assertionLine}`,
    classification: 'tool-error',
    snapshot: 'head',
  },
];

const RUNNERS = [
  {
    runner: 'Jest',
    fixture: 'jest-project',
    imports: "import { expect, it } from '@jest/globals';",
    assertion: (call, expected) => `expect(${call}).toEqual(${expected});`,
    failure: "Error: expect(received).toEqual(expected) // deep equality",
  },
  {
    runner: 'node:test',
    fixture: 'node-test-project',
    imports: "import assert from 'node:assert/strict';\nimport { it } from 'node:test';",
    assertion: (call, expected) => `assert.deepStrictEqual(${call}, ${expected});`,
    failure: 'Expected values to be strictly deep-equal:',
  },
];

function testFile({ imports, assertion }, subject, call, expected) {
  return `${imports}
import { ${subject} } from '../src/main/features/greeting/index.js';

it('checks ${subject}', () => {
  ${assertion(call, expected)}
});
`;
}

describe.each(RUNNERS)('a $runner project', (runner) => {
  const fixtureRoot = path.join(import.meta.dirname, '../fixtures', runner.fixture);
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
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'runner', files });
    temporaryRoots.push(root);
    return root;
  }

  function runSnapshot(root, extraArguments = []) {
    const result = runNitpicker(root, [
      '--all',
      '--output',
      path.join(root, 'reports/snapshot'),
      ...extraArguments,
    ]);
    return {
      ...result,
      toolErrors: readReport(root, 'reports/snapshot/tool-errors.json'),
      findings: readReport(root, 'reports/snapshot/findings.json'),
    };
  }

  it(
    'passes `nitpicker --all` with no enforceable findings',
    () => {
      const { exitCode, stderrText, toolErrors, findings } = runSnapshot(createProject());

      expect(stderrText).toBe('');
      expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
      expect(toolErrors).toEqual([]);
      expect(
        findings.find(({ tool, identity }) => tool === 'crap' && identity === 'summary:files')
          ?.metric.value,
      ).toBe(SOURCE_FILES);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'reports a failing test as a tool error instead of crashing the coverage runner',
    () => {
      const root = createProject({
        'test/failing.test.js': testFile(runner, 'greet', "greet('Ada')", "{ kind: 'empty-name' }"),
      });

      const { exitCode, toolErrors } = runSnapshot(root, ['--analyzer', 'coverage']);

      expect(toolErrors).toEqual(FAILING_COVERAGE_TOOL_ERRORS(runner.failure));
      expect(exitCode).toBe(2);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'fails a mutant that no test kills',
    () => {
      const root = createProject({
        'src/main/features/greeting/domain/shout.js': SHOUT_SOURCE,
        'src/main/features/greeting/index.js': INDEX_WITH_SHOUT,
        'test/shout.test.js': testFile(runner, 'shout', "typeof shout('a')", "'string'"),
      });

      const { exitCode, toolErrors, findings } = runSnapshot(root, [
        '--analyzer',
        'coverage',
        '--analyzer',
        'mutation',
      ]);

      expect(toolErrors).toEqual([]);
      expect(
        findings
          .filter(({ rule }) => rule === 'mutant-survived')
          .map(({ path: file, line, message }) => ({ file, line, message })),
      ).toEqual([]);
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});

describe('a project that mixes test runners', () => {
  const fixtureRoot = path.join(import.meta.dirname, '../fixtures/node-test-project');
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

  function createProject(files) {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'mixed-runner', files });
    temporaryRoots.push(root);
    return root;
  }

  it(
    'stops with the evidence for each runner and the key that chooses one',
    () => {
      const root = createProject({ 'package.json': MIXED_PACKAGE_JSON });

      const { exitCode, stderrText } = runNitpicker(root, ['--all']);

      expect(stderrText).toBe(MIXED_RUNNERS_MESSAGE);
      expect(exitCode).toBe(2);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'runs the runner that nitpicker.config.json names',
    () => {
      const root = createProject({
        'package.json': MIXED_PACKAGE_JSON,
        'nitpicker.config.json':
          '{ "preset": "javascript", "tools": { "tests": { "runner": "node-test" } } }\n',
      });

      const { exitCode, stderrText } = runNitpicker(root, [
        '--all',
        '--analyzer',
        'coverage',
        '--output',
        path.join(root, 'reports/snapshot'),
      ]);

      expect(stderrText).toBe('');
      expect(readReport(root, 'reports/snapshot/tool-errors.json')).toEqual([]);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
