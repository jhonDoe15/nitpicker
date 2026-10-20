import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { codeFilesUnder, existingRoots } from './project-code-files.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'layout-code-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/value.ts'), 'export const value = 42;');
  return root;
}

describe('project code traversal', () => {
  it('finds code below a configured project root', () => {
    expect(codeFilesUnder(resolveLayout(), projectRoot(), ['src'])).toEqual(['src/value.ts']);
  });

  it('normalizes a relative project root before checking containment', () => {
    const root = path.relative(process.cwd(), projectRoot());
    expect(codeFilesUnder(resolveLayout(), root, ['src'])).toEqual(['src/value.ts']);
    expect(existingRoots(root, ['src', 'missing'])).toEqual(['src']);
  });

  it('rejects a source root that escapes the project', () => {
    const root = projectRoot();
    expect(() => existingRoots(root, ['../outside'])).toThrow('Source root is outside the project');
    expect(() => codeFilesUnder(resolveLayout(), root, ['../outside'])).toThrow(
      'Source root is outside the project',
    );
  });
});
