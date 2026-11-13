import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLINT_REGISTRY, eslintPluginRules, eslintRegistrySource } from './eslint-registry.mjs';
import { nitpickerRules } from '../../languages/typescript/preset/eslint-plugin/index.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

describe("the ESLint plugin's rule map", () => {
  it('is generated from the rule folders, one rule per module that exports `rule`, named after its file', async () => {
    const rules = eslintPluginRules(REPOSITORY_ROOT);

    expect(Object.keys(nitpickerRules.rules)).toEqual(rules.map(({ id }) => id));
    expect(rules.filter(({ id, file }) => path.basename(file, '.mjs') !== id)).toEqual([]);
    expect(readFileSync(path.join(REPOSITORY_ROOT, ESLINT_REGISTRY), 'utf8')).toBe(
      await eslintRegistrySource(REPOSITORY_ROOT),
    );
  });
});
