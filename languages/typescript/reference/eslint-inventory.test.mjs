import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ESLINT_CONFIGS,
  ESLINT_VARIANTS,
  inventoryOfConfigs,
  readEslintInventory,
  variantEnvironment,
  variantProject,
} from './eslint-inventory.mts';

const roots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function liveInventory(variant) {
  const root = variantProject(variant);
  roots.push(root);
  for (const [name, value] of Object.entries(variantEnvironment(root))) {
    vi.stubEnv(name, value);
  }
  const configs = await Promise.all(
    ESLINT_CONFIGS.map(async ([tool, url]) => [
      tool,
      (await import(`${url.href}?variant=${variant}`)).default,
    ]),
  );
  return inventoryOfConfigs({ configs, cwd: root, files: ESLINT_VARIANTS[variant].files });
}

describe('the built ESLint inventory of the rule reference', () => {
  it.each(Object.keys(ESLINT_VARIANTS))(
    'lists the rules the %s configs turn on (run npm run gen:rules -- --data)',
    async (variant) => {
      expect(await liveInventory(variant)).toEqual(readEslintInventory()[variant]);
    },
  );

  it('has an inventory for each variant and nothing else', () => {
    expect(Object.keys(readEslintInventory())).toEqual(Object.keys(ESLINT_VARIANTS));
  });
});

describe('the ESLint inventory file', () => {
  it('is build output, so two rule changes never merge into one committed file', () => {
    expect(
      readFileSync(path.resolve(import.meta.dirname, '../../../.gitignore'), 'utf8')
        .split('\n')
        .filter((line) => line.includes('eslint-inventory')),
    ).toEqual(['languages/typescript/reference/eslint-inventory.json']);
  });
});
