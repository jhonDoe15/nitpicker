import { afterEach, describe, expect, it } from 'vitest';
import {
  PICK_SOURCE,
  UNCOVERED_ELSE,
  rulesOf,
  runArea,
  createRunnerProjects,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const IMPORTS = "import { it } from 'node:test';\nimport assert from 'node:assert/strict';\n";

const PICK_TEST = `${IMPORTS}it('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`;

const ENUM_AND_ARROW = [
  'export enum Kind {',
  '  Yes,',
  '}',
  'export const pick = (flag: boolean): string => {',
  '  if (flag) {',
  "    return 'yes';",
  '  }',
  "  return 'no';",
  '};',
  '',
].join('\n');

const changedBranchMessages = (findings) =>
  findings.filter(({ rule }) => rule === 'changed-branch-coverage').map(({ message }) => message);

function nodeTestProject(files, test = 'node --test') {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test } },
    'src/main/pick.ts': PICK_SOURCE,
    ...files,
  });
}

afterEach(() => {
  projects.remove();
});

describe('coverage on a node:test project', () => {
  it('runs the tests with node:test, then CRAP reads the coverage it wrote', async () => {
    const root = nodeTestProject({
      'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
    });

    const coverage = await runArea('coverage', root);
    const crap = await runArea('crap', root);

    expect(coverage.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
    expect(crap.find(({ identity }) => identity.endsWith(':branchCoverage'))?.metric.value).toBe(
      50,
    );
  });

  it('names the failing test and the file that could not load', async () => {
    const root = nodeTestProject({
      'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says no', () => {\n  assert.equal(pick(true), 'no');\n});\n`,
      'test/broken.test.ts': "import { missing } from 'not-installed';\nmissing();\n",
    });

    const findings = await runArea('coverage', root);

    expect(rulesOf(findings)).toEqual(['tool-error:tests-failed']);
    expect(findings[0].message).toMatch(/test\/pick\.test\.ts > says no: /u);
    expect(findings[0].message).toMatch(
      /test\/broken\.test\.ts > could not run: Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package 'not-installed'/u,
    );
  });

  it('also runs the test files the test script names', async () => {
    const root = nodeTestProject(
      {
        'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
        'checks/no.check.ts': `${IMPORTS}import { pick } from '../src/main/pick.ts';\nit('says no', () => {\n  assert.equal(pick(false), 'no');\n});\n`,
      },
      'node --test "checks/*.check.ts"',
    );

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'changed-branch-coverage')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(2);
  });

  it('maps the coverage of code tsx rewrote back to the TypeScript file', async () => {
    const root = nodeTestProject(
      {
        'test/pick.test.ts': `${IMPORTS}import { pick } from '../src/main/pick';\nit('says yes', () => {\n  assert.equal(pick(true), 'yes');\n});\n`,
      },
      'tsx --test test/pick.test.ts',
    );

    const findings = await runArea('coverage', root);

    expect(findings.find(({ rule }) => rule === 'changed-branch-coverage')?.message).toMatch(
      UNCOVERED_ELSE,
    );
  });

  it('runs each test file once when the test script names no files', async () => {
    const root = nodeTestProject({
      'test/pick.test.ts': `import { pick } from '../src/main/pick.ts';\n${PICK_TEST}`,
    });

    const findings = await runArea('coverage', root);

    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(1);
  });

  it('loads the tests through a require hook and maps what ts-node compiled for an old target', async () => {
    const root = projects.project({
      'package.json': {
        name: 'p',
        scripts: {
          test: 'TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test test/fallback.test.ts',
        },
      },
      'tsconfig.json': {
        compilerOptions: { module: 'commonjs', target: 'es2017', types: ['node'], rootDir: '.' },
      },
      'src/main/fallback.ts':
        "export const fallback = (value?: string): string => value ?? 'none';\n",
      'test/fallback.test.ts': `${IMPORTS}import { fallback } from '../src/main/fallback';\nit('keeps it', () => {\n  assert.equal(fallback('a'), 'a');\n});\n`,
    });

    const findings = await runArea('coverage', root);

    expect(changedBranchMessages(findings)).toEqual([
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the right side of ?? at 1:62. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/fallback.ts"],"function":"fallback","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it.each([
    ['tsx --test test/pick.test.ts', '../src/main/pick'],
    ['node --experimental-transform-types --test test/pick.test.ts', '../src/main/pick.ts'],
  ])(
    'keeps an arrow function next to an enum and no branch of the enum (%s)',
    async (test, from) => {
      const root = nodeTestProject(
        {
          'src/main/pick.ts': ENUM_AND_ARROW,
          'test/pick.test.ts': `import { pick } from '${from}';\n${PICK_TEST}`,
        },
        test,
      );

      const coverage = await runArea('coverage', root);
      const crap = await runArea('crap', root);

      expect(coverage.find(({ identity }) => identity === 'branches')?.metric.value).toBe(50);
      expect(
        crap
          .filter(({ identity }) => identity.endsWith(':branchCoverage'))
          .map(({ identity, metric }) => [identity, metric.value]),
      ).toEqual([['function:pick:occurrence:1:branchCoverage', 50]]);
    },
  );

  it('leaves out the module a test mocks with mock.module', async () => {
    const root = nodeTestProject(
      {
        'src/main/use.ts':
          "import { pick } from './pick.ts';\nexport const use = (flag: boolean): string => pick(flag);\n",
        'test/use.test.ts': `${IMPORTS}import { mock } from 'node:test';\nit('uses the mock', async () => {\n  mock.module('../src/main/pick.ts', { namedExports: { pick: () => 'mocked' } });\n  const { use } = await import('../src/main/use.ts');\n  assert.equal(use(true), 'mocked');\n});\n`,
      },
      'node --experimental-test-module-mocks --test',
    );

    const findings = await runArea('coverage', root);

    expect(changedBranchMessages(findings)).toEqual([
      'Branch coverage is 0.00%; minimum is 95%. Not taken: the true arm of the if at 2:3; the false arm of the if (or its else) at 2:3. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/pick.ts"],"function":"pick","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it.each([
    ['ES modules', { type: 'module', scripts: { test: 'node --test' } }, 'test/b.test.mjs'],
    [
      'a require hook',
      {
        scripts: {
          test: 'TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test test/*.test.ts',
        },
      },
      'test/b.test.ts',
    ],
  ])(
    'restores what a test replaced with mock.method before the next test, with %s',
    async (_loading, manifest, second) => {
      const replaceThenRead = [
        `${IMPORTS}import { mock } from 'node:test';`,
        "const target = { answer: () => 'real' };",
        "it('replaces the answer', () => {",
        "  mock.method(target, 'answer', () => 'fake');",
        "  assert.equal(target.answer(), 'fake');",
        '});',
        "it('reads the real answer', () => {",
        "  assert.equal(target.answer(), 'real');",
        '});',
        '',
      ].join('\n');
      const root = projects.project({
        'package.json': { name: 'p', ...manifest },
        'tsconfig.json': {
          compilerOptions: { module: 'commonjs', target: 'es2022', types: ['node'], rootDir: '.' },
        },
        'src/main/pick.ts': PICK_SOURCE,
        'test/a.test.ts': replaceThenRead,
        [second]: replaceThenRead,
      });

      const findings = await runArea('coverage', root);

      expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
      expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(4);
    },
  );

  it('keeps a double a before hook made, and restores the ones each test made', async () => {
    const sharedDouble = [
      "import { after, before, beforeEach, describe, it, mock } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "const target = { answer: () => 'real', other: () => 'real' };",
      "describe('a double made once for the suite', () => {",
      "  before(() => { mock.method(target, 'answer', () => 'fake'); });",
      '  after(() => { mock.restoreAll(); });',
      "  beforeEach(() => { mock.method(target, 'other', () => 'each'); });",
      "  it('reads the doubles', () => {",
      "    assert.deepEqual([target.answer(), target.other()], ['fake', 'each']);",
      '  });',
      "  it('reads them again', () => {",
      "    assert.deepEqual([target.answer(), target.other()], ['fake', 'each']);",
      '  });',
      '});',
      "it('runs after the suite restored its doubles', () => {",
      "  assert.deepEqual([target.answer(), target.other()], ['real', 'real']);",
      '});',
      '',
    ].join('\n');
    const root = nodeTestProject({ 'test/shared.test.mjs': sharedDouble });

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(3);
  });

  it('leaves a process a test forks free of the mock restoring preload', async () => {
    const forksChild = [
      "import { fork } from 'node:child_process';",
      "import { once } from 'node:events';",
      "import { it } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "it('reads what the forked child prints', async () => {",
      "  const child = fork(new URL('../scripts/child.mjs', import.meta.url), [], { silent: true });",
      '  const chunks = [];',
      "  child.stdout.on('data', (chunk) => chunks.push(chunk));",
      "  await once(child, 'close');",
      "  assert.equal(Buffer.concat(chunks).toString(), 'hello');",
      '});',
      '',
    ].join('\n');
    const root = nodeTestProject({
      'scripts/child.mjs': "process.stdout.write('hello');\n",
      'test/fork.test.mjs': forksChild,
    });

    const findings = await runArea('coverage', root);

    expect(findings.filter(({ rule }) => rule === 'tests-failed')).toEqual([]);
    expect(findings.find(({ identity }) => identity === 'test-count')?.metric.value).toBe(1);
  });
});
