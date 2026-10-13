import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { headPolicyEnvironment, withHeadPolicyFile } from '../head-policy.mjs';
import { typescriptFileLimitFindings } from './file-limits.mjs';

let projectRoot;

function write(files) {
  for (const file of files) {
    mkdirSync(path.join(projectRoot, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), 'export const a = 1;\n');
  }
}

function findingsWith(policy) {
  return withHeadPolicyFile(policy, (policyFile) =>
    typescriptFileLimitFindings(projectRoot, 'structure', headPolicyEnvironment(policyFile)).map(
      ({ rule, path: findingPath, identity }) => [rule, findingPath, identity],
    ),
  );
}

describe('TypeScript file limits', () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-ts-file-limits-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('counts source files, colocated tests and test roots apart, and skips non-code files', () => {
    write([
      'src/feature/a.ts',
      'src/feature/b.ts',
      'src/feature/c.ts',
      'src/feature/a.test.ts',
      'src/feature/b.test.ts',
      'src/feature/data.json',
      'src/feature/styles.css',
      'test/a.test.ts',
      'test/b.test.ts',
      'test/c.test.ts',
      'config/a.ts',
      'config/b.ts',
      'config/c.ts',
    ]);

    expect(findingsWith({ thresholds: { folderFiles: 2 } })).toEqual([
      ['folder-files-limit', 'src/feature', 'folder-files:source:3'],
      ['folder-files-limit', 'test', 'folder-files:test:3'],
    ]);
  });

  it('honours the layout roots, exclude globs and exceptions from the head policy', () => {
    write(['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/gen/a.ts', 'lib/gen/b.ts', 'lib/gen/c.ts']);

    expect(
      findingsWith({
        layout: { sourceRoots: ['lib'] },
        exclude: ['lib/gen/**'],
        thresholds: { folderFiles: 2 },
      }),
    ).toEqual([['folder-files-limit', 'lib', 'folder-files:source:3']]);
    expect(
      findingsWith({
        layout: { sourceRoots: ['lib'] },
        thresholds: { folderFiles: 2 },
        exceptions: [{ rule: 'folder-files-limit', paths: ['lib/**'], reason: 'x' }],
      }),
    ).toEqual([]);
  });
});
