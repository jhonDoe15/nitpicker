import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from './tooling/tool-resolution.mjs';

const root = PACKAGE_ROOT;

function sourceFiles(directory) {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === 'fixtures' ? [] : sourceFiles(relative);
    }
    if (entry.name.endsWith('.test.mjs') || entry.name === 'README.md') return [];
    return statSync(path.join(root, relative)).isFile() ? [relative] : [];
  });
}

function assertRuntimeFiles(files) {
  for (const relative of [
    'package.json',
    ...['core', 'shared', 'languages'].flatMap(sourceFiles),
  ]) {
    expect(files.has(relative), `missing runtime file ${relative}`).toBe(true);
  }
}

describe('npm package contents', () => {
  it('fails when a runtime file is omitted from files', () => {
    const files = new Set(['package.json']);
    expect(() => {
      assertRuntimeFiles(files);
    }).toThrow('missing runtime file');
  });
  it('ships the complete runtime tree without tests, fixtures, or the lockfile', () => {
    let listing;
    try {
      listing = JSON.parse(
        execFileSync('npm', ['pack', '--dry-run', '--json'], {
          cwd: root,
          encoding: 'utf8',
        }),
      );
    } catch (error) {
      throw new Error('npm pack did not return a valid listing', {
        cause: error,
      });
    }
    const files = new Set(listing[0].files.map(({ path: file }) => file));
    assertRuntimeFiles(files);
    expect(files.has('core/fix/run-fix.mjs')).toBe(true);
    expect(files.has('languages/java/gradle/nitpicker.init.gradle')).toBe(true);
    expect(files.has('languages/java/detekt/nitpicker-detekt.yml')).toBe(true);
    expect(files.has('languages/python/ruff/nitpicker-ruff.toml')).toBe(true);
    expect(files.has('languages/python/adapters/python-runner.mjs')).toBe(true);
    expect(files.has('languages/python/ingest/coverage-json.mjs')).toBe(true);
    expect(
      [...files].filter(
        (file) =>
          file.endsWith('.test.mjs') || file.includes('/fixtures/') || file === 'package-lock.json',
      ),
    ).toEqual([]);
  });
});
