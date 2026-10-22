import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { staleExceptionLines } from './stale-exceptions.mjs';

const { createGitRepository } = useGitFixtures();

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

  it('checks the ruff and type-checker exceptions of a Python project too', () => {
    const root = repository(['src/app.py']);
    const config = {
      preset: 'python',
      exceptions: [entry('file-lines-limit', ['gone/**']), entry('file-lines-limit', ['src/*.py'])],
      python: { exceptions: [entry('T201', ['scripts/**']), entry('T201', ['src/*.py'])] },
    };

    expect(staleExceptionLines(config, root)).toEqual([
      'exceptions[0] (file-lines-limit) matches no file: gone/**',
      'python.exceptions[0] (T201) matches no file: scripts/**',
    ]);
  });

  it('leaves the stability exceptions of a Java project alone, whose paths are packages', () => {
    const root = repository(['src/main/java/app/A.java']);
    const config = { preset: 'java', exceptions: [entry('stability-direction', ['app'])] };

    expect(staleExceptionLines(config, root)).toEqual([]);
  });

  it('lets a rule about a folder name the folder itself', () => {
    const root = repository(['src/big/a.ts', 'src/big/b.ts', 'svc/build/out.js', 'src/x.ts']);
    const config = {
      exceptions: [
        entry('folder-files-limit', ['src/big']),
        entry('folder-files-limit', ['src/big/']),
        entry('folder-files-limit', ['src/gone']),
        entry('committed-build-output', ['svc/build']),
        entry('committed-build-output', ['svc/build/**']),
        entry('file-lines-limit', ['src/big']),
      ],
    };

    expect(staleExceptionLines(config, root)).toEqual([
      'exceptions[2] (folder-files-limit) matches no file: src/gone',
      'exceptions[5] (file-lines-limit) matches no file: src/big',
    ]);
  });

  it('has nothing to say without exceptions', () => {
    expect(staleExceptionLines({}, repository(['a.ts']))).toEqual([]);
  });
});
