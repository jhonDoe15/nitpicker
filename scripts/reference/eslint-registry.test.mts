import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ESLINT_REGISTRY_PARTS,
  eslintPluginRules,
  eslintRegistrySources,
} from './eslint-registry.mjs';
import { nitpickerRules } from '../../languages/typescript/preset/eslint-plugin/index.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

describe("the ESLint plugin's rule map", () => {
  it('is generated from the rule folders, one rule per module that exports `rule`, named after its file', async () => {
    const rules = eslintPluginRules(REPOSITORY_ROOT);

    expect(Object.keys(nitpickerRules.rules)).toEqual(rules.map(({ id }) => id));
    expect(rules.filter(({ id, file }) => path.basename(file, '.mjs') !== id)).toEqual([]);
    const generated = await eslintRegistrySources(REPOSITORY_ROOT);
    const committed = [...generated.keys()].map((file) => [
      file,
      readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8'),
    ]);
    expect(Object.fromEntries(committed)).toEqual(Object.fromEntries(generated));
    const parts = readdirSync(path.join(REPOSITORY_ROOT, ESLINT_REGISTRY_PARTS));
    expect(new Set(parts.map((name) => `${ESLINT_REGISTRY_PARTS}/${name}`))).toEqual(
      new Set([...generated.keys()].filter((file) => file.startsWith(`${ESLINT_REGISTRY_PARTS}/`))),
    );
  });
});
