import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pythonFileLimitFindings } from './file-limits.mjs';

let projectRoot;

function write(files, text = 'VALUE = 1\n') {
  for (const file of files) {
    mkdirSync(path.join(projectRoot, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), text);
  }
}

function findingsWith(policy) {
  return pythonFileLimitFindings(projectRoot, policy).map(
    ({ rule, path: findingPath, identity }) => [rule, findingPath, identity],
  );
}

const limits = { folderFiles: 2 };

describe('Python file limits', () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-file-limits-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('counts source and test modules apart, and skips non-Python files and tool folders', () => {
    write([
      'src/app/a.py',
      'src/app/b.py',
      'src/app/test_a.py',
      'src/app/test_b.py',
      'src/app/settings.toml',
      'src/app/README.md',
      'tests/test_a.py',
      'tests/test_b.py',
      'tests/conftest.py',
      '.venv/lib/x.py',
      'venv/lib/a.py',
      'venv/lib/b.py',
      'venv/lib/c.py',
      'src/app/__pycache__/a.py',
      'src/app/__pycache__/b.py',
      'src/app/__pycache__/c.py',
    ]);

    expect(findingsWith({ fileLimits: limits })).toEqual([
      ['folder-files-limit', 'tests', 'folder-files:test:3'],
    ]);
  });

  it('checks file and line length with the test-file limit for tests', () => {
    write(['src/app/long.py', 'tests/test_long.py'], 'VALUE = 1\n'.repeat(301));
    write(['src/app/wide.py'], `VALUE = ${'1 + '.repeat(40)}1\n`);

    expect(findingsWith({}).map(([rule, findingPath]) => [rule, findingPath])).toEqual([
      ['file-lines-limit', 'src/app/long.py'],
      ['line-length-limit', 'src/app/wide.py'],
    ]);
  });

  it('honours exclude and file-limit exceptions', () => {
    write(['src/gen/a.py', 'src/gen/b.py', 'src/gen/c.py', 'src/icons/a.py', 'src/icons/b.py']);
    write(['src/icons/c.py']);

    expect(
      findingsWith({
        exclude: ['src/gen/**'],
        fileLimits: limits,
        exceptions: [{ rule: 'folder-files-limit', glob: 'src/icons/*' }],
      }),
    ).toEqual([]);
  });
});
