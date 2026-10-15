import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { staleExceptionLines } from './stale-exceptions.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function repository(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-stale-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
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
