import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  createCleanProject,
  readReport,
  runNitpicker,
} from '../../../typescript/preset/clean-projects/test-support/clean-project.mjs';

const FIXTURE_TIMEOUT_MS = 180_000;
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
const MIXED_FILES = {
  'package.json': `${JSON.stringify({
    name: 'mixed-fixture',
    private: true,
    type: 'module',
    scripts: { 'test:node': 'node --test' },
    devDependencies: { jest: '30.5.2' },
  })}\n`,
  'jest.config.js': "export default { testEnvironment: 'node' };\n",
};
const MIXED_RUNNERS_MESSAGE =
  'nitpicker failed: found several test runners: Jest (jest.config.js) and node:test (package.json script "test:node"). ' +
  'Set "tools.tests.runner" in nitpicker.config.json to "jest" or "node" to choose one.\n';
const FAILING_COVERAGE_TOOL_ERRORS = (assertionLine) => [
  {
    tool: 'coverage',
    rule: 'tests-failed',
    path: 'test/failing.test.js',
    message: `1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/failing.test.js > checks greet: ${assertionLine}`,
    snapshot: 'head',
  },
];
const SURVIVING_MUTANTS = [
  {
    file: 'src/main/features/greeting/domain/shout.js',
    message:
      'Survived MethodExpression at column 13: replacing `text.toUpperCase()` with `text.toLowerCase()` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/domain/shout.js"],"function":"shout","reason":"..."} to "exceptions" in nitpicker.config.json.',
  },
  {
    file: 'src/main/features/greeting/domain/shout.js',
    message:
      'Survived StringLiteral at column 10: replacing `` `${text.toUpperCase()}!` `` with `\'\'` (an empty string) fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears. If this is intended, add {"rule":"mutant-survived","paths":["src/main/features/greeting/domain/shout.js"],"function":"shout","reason":"..."} to "exceptions" in nitpicker.config.json.',
  },
];

const RUNNERS = [
  {
    runner: 'Jest',
    fixture: 'jest-project',
    imports: "import { expect, it } from '@jest/globals';",
    assertion: (call, expected) => `expect(${call}).toEqual(${expected});`,
    failure: 'Error: expect(received).toEqual(expected) // deep equality',
  },
  {
    runner: 'node:test',
    fixture: 'node-test-project',
    imports: "import assert from 'node:assert/strict';\nimport { it } from 'node:test';",
    assertion: (call, expected) => `assert.deepStrictEqual(${call}, ${expected});`,
    failure: 'AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:',
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

function temporaryProjects(fixture, name) {
  const fixtureRoot = path.join(import.meta.dirname, '../fixtures', fixture);
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

  return (files = {}) => {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name, files });
    temporaryRoots.push(root);
    return root;
  };
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

describe.each(RUNNERS)('a $runner project', (runner) => {
  const createProject = temporaryProjects(runner.fixture, 'runner');

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

  it('reports a failing test as a tool error instead of crashing the coverage runner', () => {
    const root = createProject({
      'test/failing.test.js': testFile(runner, 'greet', "greet('Ada')", "{ kind: 'empty-name' }"),
    });

    const { exitCode, toolErrors } = runSnapshot(root, ['--analyzer', 'coverage']);

    expect(toolErrors).toEqual(FAILING_COVERAGE_TOOL_ERRORS(runner.failure));
    expect(exitCode).toBe(2);
  });

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
          .map(({ path: file, message }) => ({ file, message })),
      ).toEqual(SURVIVING_MUTANTS);
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});

describe('a project that mixes test runners', () => {
  const createProject = temporaryProjects('node-test-project', 'mixed-runner');

  it('stops with the evidence for each runner and the key that chooses one', () => {
    const root = createProject(MIXED_FILES);

    const { exitCode, stderrText } = runNitpicker(root, ['--all']);

    expect(stderrText).toBe(MIXED_RUNNERS_MESSAGE);
    expect(exitCode).toBe(2);
  });

  it(
    'runs the analyzers that run no tests, with a notice naming the runner the lint follows',
    () => {
      const root = createProject(MIXED_FILES);

      const { exitCode, stderrText } = runNitpicker(root, [
        '--all',
        '--analyzer',
        'eslint-lint',
        '--output',
        path.join(root, 'reports/snapshot'),
      ]);

      expect(stderrText).toBe(
        `nitpicker: Test runner detection ${MIXED_RUNNERS_MESSAGE.slice('nitpicker failed: '.length, -1)} ` +
          'Until then the test-file lint rules follow node:test, and coverage, CRAP and mutation testing cannot run.\n',
      );
      expect(readReport(root, 'reports/snapshot/tool-errors.json')).toEqual([]);
      expect(
        readReport(root, 'reports/snapshot/findings.json').map(({ rule, path: file }) => ({
          rule,
          file,
        })),
      ).toEqual([]);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it('reports an unknown analyzer before the runner ambiguity', () => {
    const root = createProject(MIXED_FILES);

    const { exitCode, stderrText } = runNitpicker(root, ['--all', '--analyzer', 'no-such']);

    expect({ stderrText, exitCode }).toEqual({
      stderrText: expect.stringMatching(
        /^nitpicker failed: Unknown --analyzer: no-such\. Known analyzers: [a-z, -]+\n$/u,
      ),
      exitCode: 2,
    });
  });

  it(
    'runs the runner that nitpicker.config.json names',
    () => {
      const root = createProject({
        ...MIXED_FILES,
        'nitpicker.config.json':
          '{ "preset": "javascript", "tools": { "tests": { "runner": "node" } } }\n',
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
