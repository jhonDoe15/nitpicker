import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  rulesOf,
  runArea,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

function mochaProject(files, test = 'mocha') {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test } },
    'src/main/pick.ts': PICK_SOURCE,
    ...files,
  });
}

const testFile = (expected) =>
  `import assert from 'node:assert/strict';\nimport { pick } from '../src/main/pick.ts';\ndescribe('pick', () => {\n  it('answers', () => {\n    assert.equal(pick(true), '${expected}');\n  });\n});\n`;

const FAKE_SINON = [
  '(() => {',
  '  const replaced = [];',
  '  return {',
  '    replace(target, key, value) {',
  '      replaced.push([target, key, target[key]]);',
  '      target[key] = value;',
  '    },',
  '    restore() {',
  '      for (const [target, key, value] of replaced.splice(0)) {',
  '        target[key] = value;',
  '      }',
  '    },',
  '  };',
  '})()',
].join('\n');

const REPLACE_THEN_READ = [
  "const target = { answer: () => 'real' };",
  "it('replaces the answer', () => {",
  "  sinon.replace(target, 'answer', () => 'fake');",
  "  assert.equal(target.answer(), 'fake');",
  '});',
  "it('reads the real answer', () => {",
  "  assert.equal(target.answer(), 'real');",
  '});',
  '',
].join('\n');

afterEach(() => {
  projects.remove();
});

describe('coverage on a Mocha project', () => {
  it('runs the tests with Mocha and reports the arm no test takes', async () => {
    const findings = await runArea(
      'coverage',
      mochaProject({ 'test/pick.test.ts': testFile('yes') }),
    );

    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
  });

  it('names the failing Mocha test', async () => {
    const findings = await runArea(
      'coverage',
      mochaProject({ 'test/pick.test.ts': testFile('no') }),
    );

    expect(rulesOf(findings)).toEqual(['tool-error:tests-failed']);
    expect(findings[0].message).toMatch(/test\/pick\.test\.ts > pick answers: AssertionError/u);
  });

  it('names the test file that Mocha could not load', async () => {
    const root = mochaProject({
      'test/pick.test.ts': testFile('yes'),
      'test/broken.test.ts': "import { missing } from 'not-installed';\nmissing();\n",
    });

    const findings = await runArea('coverage', root);

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'tests-failed',
        path: 'test/broken.test.ts',
        identity: 'tests-failed',
        message:
          '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
          '  test/broken.test.ts > could not run: Error [ERR_MODULE_NOT_FOUND]: ' +
          `Cannot find package 'not-installed' imported from ${root}/test/broken.test.ts`,
        classification: 'tool-error',
      },
    ]);
  });

  it('keeps the spec and requires of the test script', async () => {
    const findings = await runArea(
      'coverage',
      mochaProject(
        {
          'test/setup.js': 'globalThis.expected = "yes";\n',
          'test/pick-answer.js': testFile('yes').replace("'yes'", 'globalThis.expected'),
        },
        'mocha --require test/setup.js test/',
      ),
    );

    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(1);
  });

  it.each([
    [
      'ts-node in the Mocha process',
      'TS_NODE_TRANSPILE_ONLY=1 mocha -r ts-node/register test/*.test.ts',
    ],
    ['tsx in a child process Mocha starts', 'mocha -n import=tsx test/*.test.ts'],
  ])('maps the coverage of code %s rewrote back to the TypeScript file', async (_loader, test) => {
    const root = projects.project({
      'package.json': { name: 'p', scripts: { test } },
      'tsconfig.json': { compilerOptions: { module: 'commonjs', target: 'es2022', rootDir: '.' } },
      'src/main/pick.ts': PICK_SOURCE,
      'test/pick.test.ts': testFile('yes').replace('../src/main/pick.ts', '../src/main/pick'),
    });

    const findings = await runArea('coverage', root);

    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
  });

  it('restores what a test replaced through either sinon entry before the next test', async () => {
    const root = projects.project(
      {
        'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
        'src/main/pick.ts': PICK_SOURCE,
        'node_modules/sinon/package.json': {
          name: 'sinon',
          exports: { '.': { require: './sinon.cjs', import: './sinon.mjs' } },
        },
        'node_modules/sinon/sinon.cjs': `module.exports = ${FAKE_SINON};\n`,
        'node_modules/sinon/sinon.mjs': `export default ${FAKE_SINON};\n`,
        'test/esm.test.js': `import sinon from 'sinon';\nimport assert from 'node:assert/strict';\n${REPLACE_THEN_READ}`,
        'test/cjs.test.cjs': `const sinon = require('sinon');\nconst assert = require('node:assert/strict');\n${REPLACE_THEN_READ}`,
      },
      { linkDependencies: ['mocha'] },
    );

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(4);
  });
});
