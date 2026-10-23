import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isCollectedByRunner, projectRelative } from './runner-option.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectUnder(...segments) {
  const base = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-option-'));
  temporaryRoots.push(base);
  const root = path.join(base, ...segments);
  mkdirSync(path.join(root, 'test'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{}');
  return root;
}

describe('the project path of a linted file', () => {
  it('is relative to the working directory when the file is inside it', () => {
    expect(projectRelative('/work/app/test/a.js', '/work/app')).toBe('test/a.js');
  });

  it('is relative to the nearest package.json when the file is outside the working directory', () => {
    const root = projectUnder('src', 'app');
    const file = path.join(root, 'test', 'a.js');

    expect(projectRelative(file, path.join(tmpdir(), 'elsewhere'))).toBe('test/a.js');
    expect(
      isCollectedByRunner({
        options: [{ runner: 'mocha' }],
        filename: file,
        cwd: path.join(tmpdir(), 'elsewhere'),
      }),
    ).toBe(true);
  });
});
