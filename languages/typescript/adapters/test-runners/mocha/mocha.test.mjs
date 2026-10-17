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

const REPLACE_THEN_READ = [
  "const target = { answer: () => 'real', count: () => 1 };",
  "it('replaces the answer', () => {",
  "  sinon.replace(target, 'answer', () => 'fake');",
  "  sinon.stub(target, 'count').returns(2);",
  '  sinon.useFakeTimers().tick(1);',
  "  assert.equal(target.answer(), 'fake');",
  '});',
  "it('reads the real answer', () => {",
  "  assert.equal(target.answer(), 'real');",
  '  assert.equal(target.count(), 1);',
  '  assert.ok(Date.now() > 1000);',
  "  sinon.replace(target, 'answer', () => 'again');",
  '});',
  '',
].join('\n');

const SHARED_DOUBLE = [
  "const target = { answer: () => 'real', other: () => 'real' };",
  "describe('a double made once for the suite', () => {",
  "  before(() => { sinon.stub(target, 'answer').returns('fake'); });",
  '  after(() => { sinon.restore(); });',
  "  beforeEach(() => { sinon.stub(target, 'other').returns('each'); });",
  "  it('reads the doubles', () => {",
  "    assert.deepEqual([target.answer(), target.other()], ['fake', 'each']);",
  '  });',
  "  it('reads them again', () => {",
  "    assert.deepEqual([target.answer(), target.other()], ['fake', 'each']);",
  '  });',
  '});',
  "it('runs after the suite restored its double', () => {",
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

  it('restores what a test made with either sinon entry before the next test', async () => {
    const root = projects.project({
      'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
      'src/main/pick.ts': PICK_SOURCE,
      'test/esm.test.js': `import sinon from 'sinon';\nimport assert from 'node:assert/strict';\n${REPLACE_THEN_READ}`,
      'test/cjs.test.cjs': `const sinon = require('sinon');\nconst assert = require('node:assert/strict');\n${REPLACE_THEN_READ}`,
    });

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(4);
  });

  it('keeps a double a before hook made until the suite restores it', async () => {
    const root = projects.project({
      'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
      'src/main/pick.ts': PICK_SOURCE,
      'test/shared.test.js': `import sinon from 'sinon';\nimport assert from 'node:assert/strict';\n${SHARED_DOUBLE}`,
    });

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(3);
  });
});
