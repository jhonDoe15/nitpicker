import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitRepository,
  removeGitRepositories,
} from '../diff/git/test-support/git-repository.mjs';
import { staleExceptionLines } from './stale-exceptions.mjs';

afterEach(removeGitRepositories);

function repository(files) {
  return createGitRepository(Object.fromEntries(files.map((file) => [file, '']))).root;
}

const entry = (rule, paths) => ({ rule, paths, reason: 'A reviewed reason.' });

describe('staleExceptionLines', () => {
  it('names each exception whose paths match no file of the project', () => {
    const root = repository(['src/main/a.ts', 'src/main/[id]/b.ts']);
    const config = {
      exceptions: [
        entry('duplicate-clone', ['src/main/**']),
        entry('duplicate-clone', ['src/gone/**', 'lib/*.ts']),
        entry('duplicate-clone', ['src/main/\\[id\\]/b.ts']),
      ],
    };

    expect(staleExceptionLines(config, root)).toEqual([
      'exceptions[1] (duplicate-clone) matches no file: src/gone/**, lib/*.ts',
    ]);
  });

  it('checks python.exceptions too, under its own name', () => {
    const root = repository(['src/app.py']);
    const config = {
      preset: 'python',
      python: { exceptions: [entry('T201', ['scripts/**']), entry('T201', ['src/*.py'])] },
    };

    expect(staleExceptionLines(config, root)).toEqual([
      'python.exceptions[0] (T201) matches no file: scripts/**',
    ]);
  });

  it('leaves the stability exceptions of a Java project alone, whose paths are packages', () => {
    const root = repository(['src/main/java/app/A.java']);
    const config = { preset: 'java', exceptions: [entry('stability-direction', ['app'])] };

    expect(staleExceptionLines(config, root)).toEqual([]);
  });

  it('has nothing to say without exceptions', () => {
    expect(staleExceptionLines({}, repository(['a.ts']))).toEqual([]);
  });
});
