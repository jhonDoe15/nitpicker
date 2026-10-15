import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
import strictAdaptersConfig, { strictAdaptersTypedConfig } from './strict-adapters.mjs';

const adapterFile = 'src/main/features/billing/adapters/store.ts';

function ruleIds(filename, code) {
  return lintFixture({ config: strictAdaptersConfig, filename, code })
    .map((message) => message.ruleId)
    .filter(Boolean);
}

describe('strict adapters syntactic rules', () => {
  it.each([
    'for (const item of items) { run(item); }',
    'async function f() { try { await run(); } catch (error) { logger.error({ err: error }, "x"); } }',
    'async function f() { await Promise.all(items.map((item) => run(item))); }',
    'class StoreError extends Error {} function f() { throw new StoreError("x"); }',
    'function f(error) { throw error; }',
    'try { run(); } catch (error) { throw new StoreError("x", { cause: error }); }',
  ])('accepts %s', (code) => {
    expect(ruleIds(adapterFile, code)).toEqual([]);
  });

  it.each([
    ['for (let i = 0; i < 3; i++) {}', 'no-restricted-syntax'],
    ['for (const key in record) {}', 'no-restricted-syntax'],
    ['while (more()) {}', 'no-restricted-syntax'],
    ['do {} while (more());', 'no-restricted-syntax'],
    ['items.forEach(run);', 'no-restricted-syntax'],
    ['load().then(use);', 'no-restricted-syntax'],
    ['load().catch(use);', 'no-restricted-syntax'],
    ['load().finally(use);', 'no-restricted-syntax'],
    ['function f() { throw new Error("x"); }', 'no-restricted-syntax'],
    ['function f() { throw "x"; }', 'no-restricted-syntax'],
    ['function f() { throw { code: 1 }; }', 'no-restricted-syntax'],
    ['try { run(); } catch (error) {}', 'no-empty'],
    ['try { run(); } catch {}', 'no-empty'],
    ['try { run(); } catch (error) { cleanup(); }', 'nitpicker/no-silent-catch'],
    [
      'try { run(); } catch (error) { throw new Error(String(error)); }',
      'nitpicker/preserve-error-cause',
    ],
  ])('rejects %s', (code, ruleId) => {
    expect(ruleIds(adapterFile, code)).toContain(ruleId);
  });

  it('does not apply outside adapters', () => {
    expect(ruleIds('src/main/features/billing/domain/x.ts', 'while (more()) {}')).toEqual([]);
    expect(ruleIds('src/main/shared/x.ts', 'while (more()) {}')).toEqual([]);
  });
});

describe('strict adapters type-aware rules', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'strict-adapters-'));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const adapterDirectory = path.join(root, 'src/main/features/billing/adapters');
  mkdirSync(adapterDirectory, { recursive: true });
  // Write every fixture before the first lint: in CI, typescript-eslint builds the program once
  // (single-run mode) and does not see files created after it.
  const fixtures = {
    'floating.ts':
      'async function load(): Promise<number> { return 1; }\nasync function run() { load(); }\nexport { run };\n',
    'awaited.ts':
      'async function load(): Promise<number> { return 1; }\nasync function run() { await load(); }\nexport { run };\n',
    'voided.ts':
      'async function load(): Promise<number> { return 1; }\nasync function run() { void load(); }\nexport { run };\n',
    'throw.ts': 'export function run(value: number) { throw value; }\n',
  };
  for (const [name, code] of Object.entries(fixtures)) {
    writeFileSync(path.join(adapterDirectory, name), code);
  }
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', lib: ['ES2022'] },
      include: ['src/**/*'],
    }),
  );
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { project: './tsconfig.json', tsconfigRootDir: root },
        },
      },
      ...strictAdaptersTypedConfig,
    ],
  });

  async function messagesFor(name) {
    const [result] = await eslint.lintFiles([path.join(adapterDirectory, name)]);
    return result.messages;
  }

  it('rejects a floating promise and names await', async () => {
    const messages = await messagesFor('floating.ts');
    expect(messages.map((message) => message.ruleId)).toEqual([
      '@typescript-eslint/no-floating-promises',
    ]);
    expect(messages[0].message).toContain('awaited');
  });

  it('rejects a promise silenced with void', async () => {
    const messages = await messagesFor('voided.ts');
    expect(messages.map((message) => message.ruleId)).toEqual([
      '@typescript-eslint/no-floating-promises',
    ]);
  });

  it('accepts an awaited promise', async () => {
    const messages = await messagesFor('awaited.ts');
    expect(messages).toEqual([]);
  });

  it('rejects throwing a non-error value', async () => {
    const messages = await messagesFor('throw.ts');
    expect(messages.map((message) => message.ruleId)).toEqual([
      '@typescript-eslint/only-throw-error',
    ]);
  });
});
