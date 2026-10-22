import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeJvmTools } from '../../languages/java/fix/test-support/fake-jvm-tools.mjs';
import { fakePythonTools } from '../../languages/python/fix/test-support/fake-python-fix.mjs';
import { fixtureGit, useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { fixWorkingTree, spawnInvocation } from './run-fix.mjs';

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
    'src/A.java': 'class  A {}\n',
    'src/A.kt': 'class  A\n',
  });
  return created;
}

function operationsFor(config) {
  const created = repository();
  const python = fakePythonTools();
  const jvm = fakeJvmTools();
  const operations = [];
  const result = fixWorkingTree({
    repositoryRoot: created.root,
    projectRoot: created.root,
    baseRef: 'base',
    headPolicy: { exclude: [], conventions: {}, kotlin: { formatter: 'ktlint' } },
    config,
    executeFixCommand: (invocation) => {
      operations.push(invocation.operation);
      if (['ruff-fix', 'ruff-format-fix', 'python-probe'].includes(invocation.operation)) {
        return python.executeFixCommand(invocation);
      }
      return invocation.operation.includes('-fix') || invocation.operation === 'fix-tools'
        ? jvm.executeFixCommand(invocation)
        : { status: 0, stdout: '', stderr: '' };
    },
  });
  return { operations, result };
}

describe('fixWorkingTree', () => {
  it.each([undefined, { preset: 'typescript' }, { preset: 'javascript' }])(
    'keeps the TypeScript fixers for %j',
    (config) => {
      const { operations, result } = operationsFor(config);

      expect(operations).toEqual(['eslint-fix', 'prettier-fix']);
      expect(result.notes).toBeUndefined();
    },
  );
  it('runs only the Python fixers for the python preset', () => {
    const { operations, result } = operationsFor({ preset: 'python' });

    expect(operations).toEqual(['python-probe', 'ruff-fix', 'ruff-format-fix']);
    expect(result.fixedFiles).toEqual(['src/a.py']);
  });
  it('runs only the Java fixers for the java preset', () => {
    const { operations, result } = operationsFor({ preset: 'java' });

    expect(operations).toEqual(['fix-tools', 'java-format-fix']);
    expect(result.fixedFiles).toEqual(['src/A.java']);
  });
  it('runs the Java and Kotlin fixers for the kotlin preset', () => {
    const { operations, result } = operationsFor({ preset: 'kotlin' });

    expect(operations).toEqual(['fix-tools', 'java-format-fix', 'ktlint-fix']);
    expect(result.fixedFiles).toEqual(['src/A.java', 'src/A.kt']);
  });
});

describe('spawnInvocation', () => {
  const base = { command: 'git', args: ['hash-object', '--stdin'], input: 'b', environment: {} };

  it('runs the command for real with the input', () => {
    expect(spawnInvocation(base, {}).stdout.trim()).toBe(
      '63d8dbd40c23542e740659a7168a0ce3138ea748',
    );
  });
  it('asks for a shell only when the invocation says so', () => {
    const shellOf = (command, args, options) => options.shell;

    expect([
      spawnInvocation(base, {}, shellOf),
      spawnInvocation({ ...base, shell: true }, {}, shellOf),
    ]).toEqual([false, true]);
  });
});
