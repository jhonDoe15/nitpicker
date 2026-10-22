import { readFileSync } from 'node:fs';
import path from 'node:path';
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
        rule: 'tests-not-run',
        path: 'test/broken.test.ts',
        identity: 'tests-not-run',
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

  it('loads each test file once in a parallel run whose config also lists the specs', async () => {
    const loads = (name) =>
      [
        "import { appendFileSync } from 'node:fs';",
        `appendFileSync(new URL('../loads.log', import.meta.url), '${name}\\n');`,
        `it('${name}', () => {});`,
        '',
      ].join('\n');
    const root = mochaProject(
      {
        '.mocharc.json': { spec: ['test/**/*.test.ts'] },
        'test/a.test.ts': loads('a'),
        'test/b.test.ts': loads('b'),
      },
      'mocha --parallel --jobs 4',
    );

    const findings = await runArea('coverage', root);

    expect([
      readFileSync(path.join(root, 'loads.log'), 'utf8').split('\n').sort(),
      findings.find(({ identity }) => identity === 'test-count')?.metric.value,
    ]).toEqual([['', 'a', 'b'], 2]);
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
});
