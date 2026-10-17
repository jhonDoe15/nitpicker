import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { headPolicyEnvironment, withHeadPolicyFile } from '../../head-policy.mjs';
import { typescriptFileLimitFindings } from './file-limits.mjs';

let projectRoot;

function write(files) {
  for (const file of files) {
    mkdirSync(path.join(projectRoot, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), 'export const a = 1;\n');
  }
}

function depthFindings(policy = {}) {
  return withHeadPolicyFile(policy, (policyFile) =>
    typescriptFileLimitFindings(projectRoot, 'structure', headPolicyEnvironment(policyFile))
      .filter(({ rule }) => rule === 'folder-depth-limit')
      .map(({ path: findingPath, identity, message }) => ({
        path: findingPath,
        identity,
        message,
      }))
      .toSorted((a, b) => (`${a.path}\0${a.identity}` < `${b.path}\0${b.identity}` ? -1 : 1)),
  );
}

describe('TypeScript folder depth', () => {
  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-ts-folder-depth-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('allows one folder below features/<feature>/<layer>/ and fails a deeper one', () => {
    write([
      'src/main/features/orders/index.ts',
      'src/main/features/orders/adapters/a.ts',
      'src/main/features/orders/adapters/db/a.ts',
      'src/main/features/orders/adapters/db/deep/b.ts',
      'src/main/features/orders/adapters/db/deep/er/c.ts',
      'src/main/features/orders/adapters/db/deep/er/c.test.ts',
      'src/main/shared/x/y/z/w.ts',
    ]);

    const findings = depthFindings();

    expect(findings.map(({ path: findingPath, identity }) => [findingPath, identity])).toEqual([
      ['src/main/features/orders/adapters/db/deep', 'folder-depth:source:2'],
      ['src/main/features/orders/adapters/db/deep/er', 'folder-depth:source:3'],
      ['src/main/features/orders/adapters/db/deep/er', 'folder-depth:test:3'],
    ]);
    expect(findings[0].message).toBe(
      'Folder is 2 levels below features/<feature>/<layer>/ (limit 1). Keep files at most 1 folder below it, or move them into a feature of their own. If a reviewer agrees this is intended, add {"rule":"folder-depth-limit","paths":["src/main/features/orders/adapters/db/deep/**"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('does not count __tests__ and __mocks__ folders as levels', () => {
    write([
      'src/main/features/orders/adapters/db/a.ts',
      'src/main/features/orders/adapters/db/__tests__/a.test.ts',
      'src/main/features/orders/adapters/db/__mocks__/a.ts',
      'src/main/features/orders/adapters/__tests__/a.test.ts',
    ]);

    expect(depthFindings()).toEqual([]);
  });

  it('takes the limit from thresholds.folderDepth and follows the layout roots', () => {
    write(['lib/main/features/a/domain/x/y/z.ts', 'src/main/features/a/domain/x/y/z.ts']);

    expect(depthFindings({ layout: { sourceRoots: ['lib'] } })).toHaveLength(1);
    expect(
      depthFindings({ layout: { sourceRoots: ['lib'] }, thresholds: { folderDepth: 2 } }),
    ).toEqual([]);
  });

  it('lifts the rule for the paths an exception names', () => {
    write(['src/main/features/a/domain/x/y/z.ts']);

    expect(
      depthFindings({
        exceptions: [
          { rule: 'folder-depth-limit', paths: ['src/main/features/a/domain/x/y/**'], reason: 'x' },
        ],
      }),
    ).toEqual([]);
  });
});
