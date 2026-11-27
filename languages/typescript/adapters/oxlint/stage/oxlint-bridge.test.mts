import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { createProject } from '../test-support/oxlint-project.mts';
import { removedAfterAll } from '../test-support/engine-stub.mts';

const PARSER = JSON.stringify(import.meta.resolve('@typescript-eslint/parser'));

const root = createProject('nitpicker-oxlint-bridge-', {
  'tsconfig.json': '{}',
  'policy.mjs': [
    `import * as parser from ${PARSER};`,
    'const rule = { meta: { messages: {} }, create: () => ({}) };',
    'export default [',
    '  {',
    "    files: ['src/**/*.ts'],",
    "    languageOptions: { parser, parserOptions: { project: true, tsconfigRootDir: '.' } },",
    '    plugins: { custom: { rules: { checked: rule } } },',
    "    rules: { 'custom/checked': 'error' },",
    '  },',
    '  {',
    "    files: ['scripts/**/*.ts'],",
    "    languageOptions: { parserOptions: { project: true, tsconfigRootDir: '.' } },",
    '  },',
    "  { files: ['tests/**/*.ts'], languageOptions: { parser, parserOptions: { tsconfigRootDir: '.' } } },",
    '];',
  ].join('\n'),
});
removedAfterAll(root);

beforeAll(() => {
  vi.stubEnv('NITPICKER_DIFF_ESLINT_POLICY_CONFIG', path.join(root, 'policy.mjs'));
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('plugins bridged from the lint policy into oxlint', () => {
  it('hands over the rules of a policy plugin', async () => {
    const { bridgedPlugin } = await import('../oxlint-bridge.mts');
    const bridged = await bridgedPlugin({ namespace: 'custom', alias: 'bridged', ruleNames: [] });

    expect(bridged.meta).toEqual({ name: 'bridged' });
    expect(Object.keys(Object(bridged.rules))).toEqual(['checked']);
  });

  it('hands over ESLint core rules by name', async () => {
    const { bridgedPlugin, CORE_RULES_NAMESPACE } = await import('../oxlint-bridge.mts');
    const bridged = await bridgedPlugin({
      namespace: CORE_RULES_NAMESPACE,
      alias: 'core',
      ruleNames: ['no-var'],
    });

    expect(typeof fieldOf(fieldOf(bridged.rules, 'no-var'), 'create')).toBe('function');
  });

  it('refuses a plugin the policy does not have', async () => {
    const { bridgedPlugin } = await import('../oxlint-bridge.mts');
    await expect(
      bridgedPlugin({ namespace: 'missing', alias: 'm', ruleNames: [] }),
    ).rejects.toThrow('ESLint plugin missing is not part of the lint policy');
  });

  it('releases the parser children of typed entries that have a parser', async () => {
    const wrapper: unknown = await import('../../eslint-wrapper.config.mts');
    const parsers = listOf(fieldOf(wrapper, 'default')).map((entry) =>
      fieldOf(fieldOf(entry, 'languageOptions'), 'parser'),
    );

    expect(parsers.slice(-3).map((parser) => typeof fieldOf(parser, 'parseForESLint'))).toEqual([
      'function',
      'undefined',
      'function',
    ]);
    expect(parsers.at(-3)).not.toBe(parsers.at(-1));
  });
});
