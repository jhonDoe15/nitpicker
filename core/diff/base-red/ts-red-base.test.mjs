import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

// Real vitest, coverage and the TypeScript preset on a repository whose base fails its tests.

const CLI = path.join(PACKAGE_ROOT, 'core/cli.mjs');
const PASSING_TEST =
  "import { expect, it } from 'vitest';\nimport { greet } from '../src/greeter.ts';\n\nit('greets', () => {\n  expect(greet('Ada')).toBe('Hello, Ada!');\n});\n";
const FAILING_TEST = PASSING_TEST.replace('Hello, Ada!', 'Hi, Ada!');
const FAILURE_MESSAGE = (expected) =>
  `1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/greeter.test.ts > greets: AssertionError: expected '${expected}' to be 'Hi, Ada!' // Object.is equality`;
const BRANCHY = (name) =>
  `export function ${name}(value: number): string {\n${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((limit) => `  if (value === ${limit}) {\n    return '${limit}';\n  }\n`)
    .join('')}  return 'other';\n}\n`;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { status: result.status, text: result.stdout + result.stderr };
}

describe('TypeScript preset on a base whose tests fail', { timeout: 120_000 }, () => {
  let project;
  let output;

  const git = (...args) => {
    const result = run('git', args, project);
    expect(result.status, result.text).toBe(0);
  };
  const commitBranch = (name, files, from) => {
    git('checkout', '-q', '-b', name, from);
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
      writeFileSync(path.join(project, file), content);
    }
    git('add', '-A');
    git('commit', '-q', '-m', name);
  };
  const gate = (branch, base = 'red-base') => {
    git('checkout', '-q', branch);
    const outputRoot = path.join(output, `${branch}-${base}`);
    const result = run(
      'node',
      [CLI, '--base', base, '--analyzer', 'coverage', '--analyzer', 'crap', '--output', outputRoot],
      project,
    );
    const json = (name) => JSON.parse(readFileSync(path.join(outputRoot, name), 'utf8'));
    const enforceable = () =>
      json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
    return { exitCode: result.status, text: result.text, json, enforceable };
  };

  beforeAll(() => {
    project = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-ts-red-base-')));
    output = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-ts-red-base-out-')));
    symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(project, 'node_modules'));
    writeFileSync(path.join(project, '.gitignore'), 'node_modules\n');
    writeFileSync(
      path.join(project, 'package.json'),
      '{"name":"p","type":"module","private":true}\n',
    );
    writeFileSync(
      path.join(project, 'tsconfig.json'),
      '{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"lib":["ES2022"],"types":[]},"include":["src","test"]}\n',
    );
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Nitpicker Test');
    mkdirSync(path.join(project, 'src'));
    mkdirSync(path.join(project, 'test'));
    writeFileSync(
      path.join(project, 'src/greeter.ts'),
      'export const greet = (name: string): string => `Hello, ${name}!`;\n',
    );
    writeFileSync(path.join(project, 'src/legacy.ts'), BRANCHY('legacy'));
    writeFileSync(path.join(project, 'test/greeter.test.ts'), FAILING_TEST);
    git('add', '-A');
    git('commit', '-q', '-m', 'red-base');
    git('branch', '-m', 'red-base');
    commitBranch('repaired', { 'test/greeter.test.ts': PASSING_TEST }, 'red-base');
    commitBranch('repaired-new-code', { 'src/added.ts': BRANCHY('added') }, 'repaired');
    commitBranch(
      'still-red',
      { 'src/greeter.ts': 'export const greet = (name: string): string => `Hey, ${name}!`;\n' },
      'red-base',
    );
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  });

  it('passes a change that repairs the tests, with the failing base as a note and the untested legacy code unchanged', () => {
    const result = gate('repaired');

    expect({
      exitCode: result.exitCode,
      toolErrors: result.json('tool-errors.json'),
      notes: result.json('notes.json'),
      enforceable: result.enforceable(),
      unchangedCrapFindings: result.json('summary.json').tools.find(({ name }) => name === 'crap')
        .unchanged,
    }).toEqual({
      exitCode: 0,
      toolErrors: [],
      enforceable: [],
      unchangedCrapFindings: 1,
      notes: [
        {
          tool: 'coverage',
          snapshot: 'base',
          rule: 'tests-failed',
          path: 'test/greeter.test.ts',
          message: FAILURE_MESSAGE('Hello, Ada!'),
        },
      ],
    });
  });

  it('fails an added file that is untested and over the CRAP limit', () => {
    const result = gate('repaired-new-code');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.enforceable()).toEqual([
      ...Array(10).fill('coverage changed-branch-coverage src/added.ts'),
      'crap crap-score-limit src/added.ts',
    ]);
  });

  it('still fails when the head fails its tests too', () => {
    const result = gate('still-red');

    expect(result.exitCode, result.text).toBe(2);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'coverage',
        snapshot: 'base',
        rule: 'tests-failed',
        path: 'test/greeter.test.ts',
        message: FAILURE_MESSAGE('Hello, Ada!'),
      },
      {
        tool: 'coverage',
        snapshot: 'head',
        rule: 'tests-failed',
        path: 'test/greeter.test.ts',
        message: FAILURE_MESSAGE('Hey, Ada!'),
      },
    ]);
    expect(result.json('notes.json')).toEqual([]);
  });
});
