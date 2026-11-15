import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mts';
import { writeFiles } from '../diff/git/test-support/fixture-files.mts';
import { TOOL_TIMEOUT_MS } from '../../shared/processes/deadlines.mjs';
import { fixWorkingTree, spawnInvocation } from './run-fix.mts';
import { fakeGoFormat, fakeJvmTools, fakePythonTools } from './test-support/tool-views.mts';
import { fieldAt } from '../../scripts/json/fields.mts';
import { fieldOf, textOf } from '../../shared/values/readers.mts';
import type { FixInvocation } from './typed/fix-types.mts';

const { createGitRepository, temporaryRoot } = useGitFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

function repository() {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const created = createGitRepository(
    { 'build.gradle': "plugins { id 'java' }\n" },
    { baseRef: 'base' },
  );
  fixtureGit(created.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(created.root, {
    'src/a.ts': 'export const a = 1;\n',
    'src/a.py': 'a  =  1\n',
    'src/main/java/A.java': 'class  A {}\n',
    'src/main/kotlin/A.kt': 'class  A\n',
    'src/a.go': 'package  a\n',
  });
  return created;
}

const BASE_OPTIONS = {
  scope: undefined,
  environment: {},
  spawnEnvironment: undefined,
  dryRun: false,
  allFiles: false,
  recipes: undefined,
  analyzeFixes: undefined,
  verifyMode: 'narrow',
} as const;

const TYPESCRIPT_REPLIES = {
  'knip-fix': '',
  'eslint-fix': '[]',
  'prettier-fix': JSON.stringify({ results: [{ path: 'src/a.ts', ignored: true }] }),
};

function operationsFor(config: unknown, selectedRules: readonly string[] = []) {
  const created = repository();
  const python = fakePythonTools();
  const jvm = fakeJvmTools();
  const go = fakeGoFormat();
  const operations: string[] = [];
  const result = fixWorkingTree({
    ...BASE_OPTIONS,
    repositoryRoot: created.root,
    projectRoot: created.root,
    baseRef: 'base',
    selectedRules,
    headPolicy: { exclude: [], conventions: {}, kotlin: { formatter: 'ktlint' } },
    config,
    executeFixCommand: (invocation: FixInvocation) => {
      const operation = textOf(fieldOf(invocation, 'operation'));
      operations.push(operation);
      const reply = Object.entries(TYPESCRIPT_REPLIES).find(([name]) => name === operation);
      if (reply !== undefined) {
        return { status: 0, stdout: reply[1], stderr: '' };
      }
      if (operation === 'go-format-fix') {
        return go.executeFixCommand(invocation);
      }
      if (['ruff-fix', 'ruff-format-fix', 'python-probe'].includes(operation)) {
        return python.executeFixCommand(invocation);
      }
      return operation.includes('-fix') || ['fix-tools', 'java-probe'].includes(operation)
        ? jvm.executeFixCommand(invocation)
        : { status: 0, stdout: '', stderr: '' };
    },
  });
  return { operations: [...new Set(operations)], result };
}

describe('fixWorkingTree', () => {
  it.each([undefined, { preset: 'typescript' }, { preset: 'javascript' }])(
    'keeps the TypeScript fixers for %j',
    (config) => {
      const { operations, result } = operationsFor(config);

      expect(operations).toEqual(['knip-fix', 'eslint-fix', 'prettier-fix']);
      expect(result).toEqual({ fixedFiles: [], toolErrors: [], notes: [] });
    },
  );
  it('names a --rule that no fixer has, with the closest rule that one has', () => {
    const { result } = operationsFor({ preset: 'typescript' }, ['dead-code/exportz']);

    expect(result.notes).toEqual([
      '--fix --rule dead-code/exportz: nitpicker has no fixer named dead-code/exportz in the typescript preset. Did you mean `dead-code/exports`?',
    ]);
  });
  it('says when a --rule with a fixer found nothing to fix', () => {
    const { result } = operationsFor({ preset: 'typescript' }, ['dead-code/exports']);

    expect(result.notes).toEqual(['--fix --rule dead-code/exports: found nothing to fix']);
  });
  it('runs only the Python fixers for the python preset', () => {
    const { operations, result } = operationsFor({ preset: 'python' });

    expect(operations).toEqual(['python-probe', 'python-fix-edits', 'ruff-fix', 'ruff-format-fix']);
    expect(result.fixedFiles).toEqual(['src/a.py']);
  });
  it('runs only the Java fixers for the java preset', () => {
    const { operations, result } = operationsFor({ preset: 'java' });

    expect(operations).toEqual(['error-prone-patch', 'fix-tools', 'java-probe', 'java-format-fix']);
    expect(result.fixedFiles).toEqual(['src/main/java/A.java']);
  });
  it('runs the Java and Kotlin fixers for the kotlin preset', () => {
    const { operations, result } = operationsFor({ preset: 'kotlin' });

    expect(operations).toEqual([
      'error-prone-patch',
      'fix-tools',
      'java-probe',
      'java-format-fix',
      'ktlint-fix',
    ]);
    expect(result.fixedFiles).toEqual(['src/main/java/A.java', 'src/main/kotlin/A.kt']);
  });
  it('runs only the Go formatter for the go preset', () => {
    const { operations, result } = operationsFor({ preset: 'go' });

    expect(operations).toEqual(['go-format-fix']);
    expect(result.fixedFiles).toEqual(['src/a.go']);
  });
});

describe('spawnInvocation', () => {
  const base = {
    command: 'git',
    args: ['hash-object', '--stdin'],
    cwd: '.',
    input: 'b',
    environment: {},
  };

  it('runs the command for real with the input', () => {
    expect(textOf(fieldAt(spawnInvocation(base, {}), 'stdout')).trim()).toBe(
      '63d8dbd40c23542e740659a7168a0ce3138ea748',
    );
  });
  it('passes the timeout, defaults it and inherits the environment when nothing overrides it', () => {
    const optionsOf = (_command: string, _args: readonly string[], options: object) => [
      fieldOf(options, 'timeout'),
      fieldOf(options, 'env'),
    ];

    expect([
      spawnInvocation({ ...base, timeout: 5 }, undefined, optionsOf),
      spawnInvocation({ ...base, environment: { A: '1' } }, { B: '2' }, optionsOf),
    ]).toEqual([
      [5, undefined],
      [TOOL_TIMEOUT_MS, { B: '2', A: '1' }],
    ]);
  });
  it('asks for a shell only when the invocation says so', () => {
    const shellOf = (_command: string, _args: readonly string[], options: object) =>
      fieldOf(options, 'shell');

    expect([
      spawnInvocation(base, {}, shellOf),
      spawnInvocation({ ...base, shell: true }, {}, shellOf),
    ]).toEqual([false, true]);
  });
});
