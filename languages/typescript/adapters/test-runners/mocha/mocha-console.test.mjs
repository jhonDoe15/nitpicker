import { afterEach, describe, expect, it } from 'vitest';
import {
  JAVASCRIPT_PRESET,
  PICK_JS_SOURCE,
  PICK_SOURCE,
  consoleOutput,
  createRunnerProjects,
  newConsoleOutput,
} from '../test-support/runner-project.mjs';

const projects = createRunnerProjects();

const LANGUAGES = [
  { extension: 'ts', source: PICK_SOURCE, config: {} },
  {
    extension: 'js',
    source: PICK_JS_SOURCE,
    config: { 'nitpicker.config.json': JAVASCRIPT_PRESET },
  },
];

const HEADER = ["import assert from 'node:assert/strict';"];

function mochaProject(files, script = 'mocha') {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: script } },
    'src/main/pick.js': PICK_JS_SOURCE,
    ...files,
  });
}

function pickTest({ extension, source, config }, [first, second]) {
  return projects.project({
    'package.json': { name: 'p', type: 'module', scripts: { test: 'mocha' } },
    [`src/main/pick.${extension}`]: source,
    ...config,
    [`test/pick.test.${extension}`]: [
      ...HEADER,
      `import { pick } from '../src/main/pick.${extension}';`,
      "describe('pick', () => {",
      `  it('one', () => {\n${first}    assert.equal(pick(true), 'yes');\n  });`,
      `  it('two', () => {\n${second}    assert.equal(pick(false), 'no');\n  });`,
      '});',
      '',
    ].join('\n'),
  });
}

function testFile(lines) {
  return [...HEADER, "import { pick } from '../src/main/pick.js';", ...lines, ''].join('\n');
}

afterEach(() => {
  projects.remove();
});

describe('test console output on a Mocha project', () => {
  it.each(LANGUAGES)(
    'reports only the $extension output the head prints and the base does not',
    async (language) => {
      const old = "    console.warn('old warning about the cart');\n";
      const base = pickTest(language, [old, '']);
      const head = pickTest(language, ['', `${old}    console.error('brand new error');\n`]);

      expect(await newConsoleOutput({ base, head })).toEqual([
        [
          'test-console-output',
          `test/pick.test.${language.extension}`,
          '"brand new error" (test "pick > two")',
        ],
      ]);
    },
  );

  it('does not see a process a test starts, a stubbed fs function or the runner itself', async () => {
    const project = mochaProject({
      '.mocharc.json': { spec: ['test/**/*.test.js', 'test/**/*.spec.js'] },
      'src/main/cli.js': "console.error('usage: cli <flag>');\nprocess.stdout.write('yes\\n');\n",
      'test/cli.test.js': testFile([
        "import { spawnSync } from 'node:child_process';",
        "import fs from 'node:fs';",
        "it('prints yes', () => {",
        "  const run = spawnSync(process.execPath, ['src/main/cli.js'], { encoding: 'utf8' });",
        "  assert.deepEqual([run.stdout, run.stderr], ['yes\\n', 'usage: cli <flag>\\n']);",
        '  const { writeFileSync } = fs;',
        '  const written = [];',
        '  fs.writeFileSync = (...values) => written.push(values);',
        "  console.warn('saving');",
        "  console.assert(pick(false) === 'yes', 'got %s', pick(false));",
        '  fs.writeFileSync = writeFileSync;',
        '  assert.deepEqual(written, []);',
        "  assert.equal(pick(true) + pick(false), 'yesno');",
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/cli.test.js', '"Assertion failed: got no" (test "prints yes")'],
      ['test-console-output', 'test/cli.test.js', '"saving" (test "prints yes")'],
    ]);
  });

  it('names the file of module and hook output and drops a timer that fires in another file', async () => {
    const project = mochaProject({
      'test/a.test.js': testFile([
        "console.warn('while loading');",
        "before(() => console.warn('in a root before hook'));",
        "describe('a', () => {",
        "  after(() => console.warn('in an after hook'));",
        "  it('one', () => {",
        "    setTimeout(() => console.error('fires in b'), 20);",
        "    assert.equal(pick(true), 'yes');",
        '  });',
        '});',
      ]),
      'test/b.test.js': testFile([
        "it('waits', async () => {",
        '  await new Promise((resolve) => setTimeout(resolve, 80));',
        "  assert.equal(pick(false), 'no');",
        '});',
      ]),
    });

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/a.test.js', '"in a root before hook"'],
      ['test-console-output', 'test/a.test.js', '"in an after hook" (test "a")'],
      ['test-console-output', 'test/a.test.js', '"while loading"'],
    ]);
  });

  it.each(['mocha', 'mocha --parallel'])(
    'gives the running test what a server a root hook started prints while it handles the test (%s)',
    async (script) => {
      const project = mochaProject(
        {
          '.mocharc.json': { require: ['./test/setup.mjs'] },
          'test/setup.mjs': [
            "import { createServer } from 'node:http';",
            'export const mochaHooks = {',
            '  async beforeAll() {',
            '    globalThis.server = createServer((request, response) => {',
            '      console.error(`handler failed for ${request.url}`);',
            '      response.writeHead(500).end();',
            '    });',
            '    await new Promise((resolve) => globalThis.server.listen(0, resolve));',
            '  },',
            '  async afterAll() {',
            '    await new Promise((resolve) => globalThis.server.close(resolve));',
            '  },',
            '};',
            '',
          ].join('\n'),
          'test/api.test.js': testFile([
            "it('reports a broken route', async () => {",
            '  const { port } = globalThis.server.address();',
            '  const response = await fetch(`http://127.0.0.1:${port}/broken`);',
            '  assert.equal(response.status, 500);',
            "  assert.equal(pick(true) + pick(false), 'yesno');",
            '});',
          ]),
        },
        script,
      );

      expect(await consoleOutput(project)).toEqual([
        [
          'test-console-output',
          'test/api.test.js',
          '"handler failed for broken" (test "reports a broken route")',
        ],
      ]);
    },
  );

  it('names the test in a parallel run', async () => {
    const project = mochaProject(
      {
        'test/a.test.js': testFile([
          "it('one', () => {\n  console.warn('from a worker');\n  assert.equal(pick(true), 'yes');\n});",
        ]),
        'test/b.test.js': testFile(["it('two', () => {\n  assert.equal(pick(false), 'no');\n});"]),
      },
      'mocha --parallel',
    );

    expect(await consoleOutput(project)).toEqual([
      ['test-console-output', 'test/a.test.js', '"from a worker" (test "one")'],
    ]);
  });
});
