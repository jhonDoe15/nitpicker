import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { configResolver } from './config-resolver.mts';

const FILES = ['src/a.ts', 'src/b.ts', 'src/a.test.ts', 'dist/c.ts', 'README.md'];
const roots: string[] = [];

function projectWith(config: string) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-config-resolver-'));
  roots.push(root);
  const configPath = path.join(root, 'policy.config.mjs');
  writeFileSync(configPath, config);
  return { root, configPath };
}

async function bothConfigs(config: string) {
  const { root, configPath } = projectWith(config);
  const configOf = await configResolver(root, configPath);
  const eslint = new ESLint({ cwd: root, overrideConfigFile: configPath });
  const resolved = await Promise.all(FILES.map(configOf));
  const expected = await Promise.all(
    FILES.map(async (file): Promise<unknown> => eslint.calculateConfigForFile(file)),
  );
  return { resolved, expected };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('lint configs resolved once per distinct config', () => {
  it('returns the config ESLint computes and shares it between files with the same entries', async () => {
    const { resolved, expected } = await bothConfigs(
      `export default [
        { ignores: ['dist/**'] },
        { files: ['**/*.ts'], rules: { 'no-var': 'error' } },
        { files: ['**/*.test.ts'], rules: { 'no-eval': ['error'] } },
      ];`,
    );
    const [first, second, test, ignored, unconfigured] = resolved;

    expect(resolved).toEqual(expected);
    expect(second).toBe(first);
    expect(test).not.toBe(first);
    expect(ignored).toBeUndefined();
    expect(unconfigured).toBeUndefined();
  });

  it('asks ESLint for every file when an entry matches files with a function', async () => {
    const { resolved, expected } = await bothConfigs(
      `export default [
        { files: [(file) => file.endsWith('a.ts')], rules: { 'no-var': 'error' } },
        { files: ['**/*.ts'], rules: { 'no-eval': 'error' } },
      ];`,
    );

    expect(resolved).toEqual(expected);
  });
});
