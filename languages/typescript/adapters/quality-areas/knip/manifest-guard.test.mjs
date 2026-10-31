import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { guardKnipManifest } from './manifest-guard.mjs';

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

function manifestIn(text) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-manifest-guard-')));
  cleanups.push(() => {
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(path.join(root, 'package.json'), text);
  writeFileSync(path.join(root, 'other.json'), text);
  return root;
}

function guarded(manifestPath) {
  cleanups.push(guardKnipManifest(manifestPath));
}

describe('the package.json guard of the knip run', () => {
  it('drops the knip key wherever knip reads the manifest from, symlinked or not', async () => {
    const root = manifestIn('{ "name": "app", "knip": { "ignore": ["**"] } }');
    const linked = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-manifest-link-')), 'app');
    cleanups.push(() => {
      rmSync(path.dirname(linked), { recursive: true, force: true });
    });
    symlinkSync(root, linked);
    guarded(path.join(linked, 'package.json'));
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))).toEqual({
      name: 'app',
    });
    const url = pathToFileURL(path.join(root, 'package.json'));
    expect(JSON.parse(String(await readFile(url)))).toEqual({ name: 'app' });
    expect(JSON.parse(await readFile(path.join(root, 'other.json'), 'utf8'))).toEqual({
      name: 'app',
      knip: { ignore: ['**'] },
    });
  });

  it('reads a manifest with comments and trailing commas the way knip does', async () => {
    const root = manifestIn('{\n  // app\n  "name": "app",\n  "knip": { "ignore": ["**"] },\n}\n');
    guarded(path.join(root, 'package.json'));
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))).toEqual({
      name: 'app',
    });
  });

  it('fails closed on a manifest it cannot parse that names knip', async () => {
    const root = manifestIn('{ "name": "app", "knip": { "ignore": ["**"] ');
    guarded(path.join(root, 'package.json'));
    await expect(readFile(path.join(root, 'package.json'), 'utf8')).rejects.toThrow(
      `${path.join(root, 'package.json')} does not parse, so its "knip" key cannot be left out`,
    );
    writeFileSync(path.join(root, 'package.json'), '{ "name": "app" ');
    expect(await readFile(path.join(root, 'package.json'), 'utf8')).toBe('{ "name": "app" ');
  });

  it('restores the original reader', async () => {
    const root = manifestIn('{ "knip": {} }');
    guardKnipManifest(path.join(root, 'package.json'))();
    expect(await readFile(path.join(root, 'package.json'), 'utf8')).toBe('{ "knip": {} }');
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe('{ "knip": {} }');
  });
});
