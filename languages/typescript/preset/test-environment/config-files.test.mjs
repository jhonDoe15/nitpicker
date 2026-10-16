import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROJECT_CONFIG_NAMES, projectConfigFile } from './config-files.mjs';

const qualityConfig = readFileSync(
  path.join(import.meta.dirname, '../defaults/vitest.quality.config.ts'),
  'utf8',
);
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function quotedList(source) {
  return [...source.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
}

describe('project config names', () => {
  it('match the list vitest.quality.config.ts looks for, which cannot import this module', () => {
    const declaration =
      /const PROJECT_CONFIG_NAMES = (?<names>\[[^\]]*\])\.flatMap\(\(name\) =>\s*(?<extensions>\[[^\]]*\])\.map/u.exec(
        qualityConfig,
      );
    const names = quotedList(declaration.groups.names);
    const extensions = quotedList(declaration.groups.extensions);
    expect(
      names.flatMap((name) => extensions.map((extension) => `${name}.config.${extension}`)),
    ).toEqual(PROJECT_CONFIG_NAMES);
  });

  it('prefers vitest.config over vite.config', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-config-files-'));
    roots.push(root);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'vite.config.mts'), '');
    expect(projectConfigFile(root)).toBe(path.join(root, 'vite.config.mts'));
    writeFileSync(path.join(root, 'vitest.config.mjs'), '');
    expect(projectConfigFile(root)).toBe(path.join(root, 'vitest.config.mjs'));
  });
});
