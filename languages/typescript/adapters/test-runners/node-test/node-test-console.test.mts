import { describe, expect, it } from 'vitest';
import { consoleOutput } from '../test-support/runner-project.mts';
import { LANGUAGES, createConsoleSuite } from '../test-support/console-suite.mts';

const suite = createConsoleSuite({
  header: [
    "import { after, afterEach, before, describe, it, mock } from 'node:test';",
    "import assert from 'node:assert/strict';",
  ],
  defaultScript: 'node --test',
  pickTestLines: (first, second) => [
    `it('one', () => {\n${first}  assert.equal(pick(true), 'yes');\n});`,
    `it('two', () => {\n${second}  assert.equal(pick(false), 'no');\n});`,
  ],
});
const { testFile, project: nodeTestProject } = suite;

describe('test console output on a node:test project', () => {
  it.each(LANGUAGES)(
    'reports only the $extension output the head prints and the base does not',
    async (language) => {
      expect(await suite.newHeadOutput(language, '  ')).toEqual(
        suite.brandNewError(language, 'two'),
      );
    },
  );

  it('leaves a process a test starts alone and does not see its output', async () => {
    const project = nodeTestProject({
      'src/main/cli.js': "console.error('usage: cli <flag>');\nprocess.stdout.write('yes\\n');\n",
      'test/cli.test.js': testFile([
        "import { spawnSync } from 'node:child_process';",
        "it('prints yes', () => {",
        "  const run = spawnSync(process.execPath, ['src/main/cli.js'], { encoding: 'utf8' });",
        "  assert.deepEqual([run.status, run.stdout, run.stderr], [0, 'yes\\n', 'usage: cli <flag>\\n']);",
        "  assert.equal(pick(true) + pick(false), 'yesno');",
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([]);
  });

  it('keeps its own writes away from a test that mocks the fs functions', async () => {
    const project = nodeTestProject({
      'test/save.test.js': testFile([
        "import fs from 'node:fs';",
        "it('saves', () => {",
        "  const write = mock.method(fs, 'writeFileSync', () => {});",
        "  console.warn('saving an empty file');",
        "  console.assert(pick(false) === 'yes', 'got %s', pick(false));",
        "  fs.writeFileSync('/nowhere/out.txt', pick(false));",
        '  assert.equal(write.mock.callCount(), 1);',
        "  assert.equal(pick(true), 'yes');",
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/save.test.js', '"Assertion failed: got no" (test "saves")'],
      ['test-console-output', 'test/save.test.js', '"saving an empty file" (test "saves")'],
    ]);
  });

  it('names the file of module and hook output and drops a timer that outlives the file', async () => {
    const project = nodeTestProject({
      'test/pick.test.js': testFile([
        "console.warn('while loading');",
        "describe('suite', () => {",
        "  before(() => console.warn('in a before hook'));",
        "  after(() => console.warn('in an after hook'));",
        "  it('one', () => {",
        "    setTimeout(() => console.error('after the file'), 50);",
        "    console.warn('in the test');",
        "    assert.equal(pick(true) + pick(false), 'yesno');",
        '  });',
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/pick.test.js', '"in a before hook"'],
      ['test-console-output', 'test/pick.test.js', '"in an after hook"'],
      ['test-console-output', 'test/pick.test.js', '"in the test" (test "suite > one")'],
      ['test-console-output', 'test/pick.test.js', '"while loading"'],
    ]);
  });

  it('names the test in a root afterEach hook and reads an async root after hook', async () => {
    const project = nodeTestProject({
      'test/pick.test.js': testFile([
        'const wait = () => new Promise((resolve) => setTimeout(resolve, 20));',
        "afterEach(async () => {\n  await wait();\n  console.warn('in a root afterEach hook');\n});",
        "after(async () => {\n  await wait();\n  console.warn('in an async root after hook');\n});",
        "it('one', () => {\n  assert.equal(pick(true) + pick(false), 'yesno');\n});",
      ]),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/pick.test.js', '"in a root afterEach hook" (test "one")'],
      ['test-console-output', 'test/pick.test.js', '"in an async root after hook"'],
    ]);
  });

  it('leaves an inner node --test run alone when a test starts one without its context', async () => {
    const project = nodeTestProject({
      'fixtures/inner.mjs': [
        "import { it } from 'node:test';",
        "it('inner', () => {\n  console.warn('from the inner run');\n});",
        '',
      ].join('\n'),
      'test/runner.test.js': testFile([
        "import { spawnSync } from 'node:child_process';",
        "it('runs an inner suite', () => {",
        '  const env = { ...process.env };',
        '  delete env.NODE_TEST_CONTEXT;',
        "  const run = spawnSync(process.execPath, ['--test', 'fixtures/inner.mjs'], { env });",
        '  assert.equal(run.status, 0);',
        "  assert.equal(pick(true) + pick(false), 'yesno');",
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([]);
  });

  it('names the file of each call when every file runs in the runner process', async () => {
    const project = nodeTestProject(
      {
        'test/a.test.js': testFile([
          "console.warn('while loading a');",
          "setTimeout(() => console.warn('timer from loading a'), 40);",
          "describe('a', () => {",
          "  it('one', async () => {",
          '    await new Promise((resolve) => setTimeout(resolve, 5));',
          "    console.warn('after a wait in one');",
          "    setTimeout(() => console.warn('timer from one'), 40);",
          "    assert.equal(pick(true), 'yes');",
          '  });',
          '});',
        ]),
        'test/b.test.js': testFile([
          "it('two', async () => {",
          "  console.error('in two');",
          '  await new Promise((resolve) => setTimeout(resolve, 150));',
          "  assert.equal(pick(false), 'no');",
          '});',
        ]),
      },
      'node --test --experimental-test-isolation=none',
    );

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/a.test.js', '"after a wait in one"'],
      ['test-console-output', 'test/a.test.js', '"timer from loading a"'],
      ['test-console-output', 'test/a.test.js', '"timer from one"'],
      ['test-console-output', 'test/a.test.js', '"while loading a"'],
      ['test-console-output', 'test/b.test.js', '"in two"'],
    ]);
  });
});
