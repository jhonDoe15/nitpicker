import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProject,
  FIXTURE_TIMEOUT_MS,
  removeProjects,
  run,
  runSnapshot,
} from './fixture-project.mjs';

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

const RUNNERS = [
  {
    runner: 'Jest',
    fixture: 'jest-project',
    imports: "import { expect, it } from '@jest/globals';",
    assertion: (call, expected) => `expect(${call}).toEqual(${expected});`,
  },
  {
    runner: 'node:test',
    fixture: 'node-test-project',
    imports: "import assert from 'node:assert/strict';\nimport { it } from 'node:test';",
    assertion: (call, expected) => `assert.deepStrictEqual(${call}, ${expected});`,
  },
];

afterEach(removeProjects);

function testFile({ imports, assertion }, subject, call, expected) {
  return `${imports}
import { ${subject} } from '../src/main/features/greeting/index.js';

it('checks ${subject}', () => {
  ${assertion(call, expected)}
});
`;
}

function crapMeasuredFiles({ findings }) {
  return findings.find(({ tool, identity }) => tool === 'crap' && identity === 'summary:files')
    ?.metric.value;
}

describe.each(RUNNERS)('a $runner project', (runner) => {
  const fixtureRoot = path.join(import.meta.dirname, runner.fixture);

  it(
    'passes `nitpicker --all` with no enforceable findings',
    () => {
      const { exitCode, stdoutText, stderrText, summary } = runSnapshot(createProject(fixtureRoot));

      expect(stderrText).toBe('');
      expect(stdoutText).toContain('Enforceable findings: 0');
      expect(stdoutText).toContain('Tool errors: 0');
      expect(summary.overallStatus).toBe('clean');
      expect(crapMeasuredFiles(summary)).toBe(SOURCE_FILES);
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'reports a failing test as a tool error instead of crashing the coverage runner',
    () => {
      const root = createProject(fixtureRoot, {
        'test/failing.test.js': testFile(runner, 'greet', "greet('Ada')", "{ kind: 'empty-name' }"),
      });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'coverage']);

      expect(stdoutText).toContain(
        'coverage (head): 1 test fails, so coverage, CRAP and mutation were skipped.',
      );
      expect(stdoutText).toContain('test/failing.test.js > checks greet');
      expect(exitCode).toBe(2);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'fails a mutant that no test kills',
    () => {
      const root = createProject(fixtureRoot, {
        'src/main/features/greeting/domain/shout.js': SHOUT_SOURCE,
        'src/main/features/greeting/index.js': INDEX_WITH_SHOUT,
        'test/shout.test.js': testFile(runner, 'shout', "typeof shout('a')", "'string'"),
      });

      const { exitCode, stdoutText } = runSnapshot(root, [
        '--analyzer',
        'coverage',
        '--analyzer',
        'mutation',
      ]);

      expect(stdoutText).toContain('Tool errors: 0');
      expect(stdoutText).toContain(
        'mutation/mutant-survived src/main/features/greeting/domain/shout.js:6 Survived MethodExpression at column 13',
      );
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );
});

describe('a project that mixes test runners', () => {
  const fixtureRoot = path.join(import.meta.dirname, 'node-test-project');
  const mixed = {
    'package.json': `${JSON.stringify({
      name: 'mixed-fixture',
      private: true,
      type: 'module',
      devDependencies: { jest: '30.5.2' },
    })}\n`,
  };

  it(
    'stops with the evidence for each runner and the key that chooses one',
    () => {
      const { exitCode, stderrText } = run(createProject(fixtureRoot, mixed), ['--all']);

      expect(stderrText).toBe(
        'nitpicker.config.json: found several test runners (Jest: "jest" in package.json dependencies; node:test: test/greeting.test.js imports node:test). Choose one with "tools": { "tests": { "runner": "vitest" | "jest" | "node-test" } } in nitpicker.config.json.\n',
      );
      expect(exitCode).toBe(2);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'runs the runner that nitpicker.config.json names',
    () => {
      const root = createProject(fixtureRoot, {
        ...mixed,
        'nitpicker.config.json':
          '{ "preset": "javascript", "tools": { "tests": { "runner": "node-test" } } }\n',
      });

      const { exitCode, stdoutText } = runSnapshot(root, ['--analyzer', 'coverage']);

      expect(stdoutText).toContain('Tool errors: 0');
      expect(exitCode).toBe(0);
    },
    FIXTURE_TIMEOUT_MS,
  );
});
