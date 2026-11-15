import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { aliasesFromConfig } from './aliases.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-aliases-'));
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('aliasesFromConfig', () => {
  it('reads object and array aliases from resolve and test options', () => {
    const config = {
      resolve: { alias: { '@': path.join(root, 'src'), react: 'preact/compat' } },
      test: { alias: [{ find: /^#(.*)$/u, replacement: path.join(root, 'src/$1') }] },
    };
    expect(aliasesFromConfig(config, root)).toEqual([
      { find: '@', replacement: path.join(root, 'src') },
      { find: 'react', replacement: 'preact/compat' },
      { find: { pattern: '^#(.*)$', flags: 'u' }, replacement: path.join(root, 'src/$1') },
    ]);
  });

  it('maps root-relative and relative replacements into the project', () => {
    const config = { resolve: { alias: { '@': '/src', '~': './lib', abs: '/opt/shared' } } };
    expect(aliasesFromConfig(config, root)).toEqual([
      { find: '@', replacement: path.join(root, 'src') },
      { find: '~', replacement: path.join(root, 'lib') },
      { find: 'abs', replacement: '/opt/shared' },
    ]);
  });

  it('skips entries it cannot pass on and configs without aliases', () => {
    const config = {
      resolve: { alias: [{ find: 1, replacement: '/x' }, { find: 'y', customResolver: {} }, 'z'] },
    };
    expect(aliasesFromConfig(config, root)).toEqual([]);
    expect(aliasesFromConfig({}, root)).toEqual([]);
    expect(aliasesFromConfig(undefined, root)).toEqual([]);
  });
});
