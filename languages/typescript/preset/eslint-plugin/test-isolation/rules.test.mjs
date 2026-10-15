import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { rule as noProductionImportsInSetupFiles } from './no-production-imports-in-setup-files.mjs';
import { rule as noRealTimeRandomOrNetwork } from './no-real-time-random-or-network.mjs';
import { rule as noUncollectedTests } from './no-uncollected-tests.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});
const lines = (...parts) => parts.join('\n');
const setupFile = '/repo/test/setup.ts';

tester.run('no-production-imports-in-setup-files', noProductionImportsInSetupFiles, {
  valid: [
    { filename: setupFile, code: "import '@testing-library/jest-dom/vitest';" },
    { filename: setupFile, code: "import { afterEach } from 'vitest'; afterEach(() => {});" },
    { filename: setupFile, code: "import { build } from './helpers/build.js';" },
    { filename: setupFile, code: "import { build } from '../src/main/feature.test.js';" },
    { filename: setupFile, code: "const loaded = await import('./helpers/db.js');" },
  ],
  invalid: [
    {
      filename: setupFile,
      code: "import { classify } from '../src/main/classify.js';",
      errors: [{ messageId: 'productionImport', data: { source: '../src/main/classify.js' } }],
    },
    {
      filename: setupFile,
      code: "export * from '../src/main/classify.js';",
      errors: [{ messageId: 'productionImport' }],
    },
    {
      filename: setupFile,
      code: "export { classify } from '../src/main/classify.js';",
      errors: [{ messageId: 'productionImport' }],
    },
    {
      filename: setupFile,
      code: "const { classify } = await import('../src/main/classify.js');",
      errors: [{ messageId: 'productionImport' }],
    },
    {
      filename: setupFile,
      code: "const classify = require('../src/main/classify.js');",
      errors: [{ messageId: 'productionImport' }],
    },
    {
      filename: '/repo/vitest.setup.ts',
      code: "import './src/boot.js';",
      errors: [{ messageId: 'productionImport' }],
    },
  ],
});

const unitOptions = [{ network: true }];

tester.run('no-real-time-random-or-network', noRealTimeRandomOrNetwork, {
  valid: [
    "it('x', () => { expect(new Date(0).getTime()).toBe(0); });",
    "it('x', () => { vi.useFakeTimers(); vi.setSystemTime(0); expect(Date.now()).toBe(0); });",
    "it('x', () => { vi.setSystemTime(new Date('2026-01-01')); expect(new Date().getFullYear()).toBe(2026); });",
    "it('x', () => { vi.spyOn(Math, 'random').mockReturnValue(0.5); expect(Math.random()).toBe(0.5); });",
    { code: "it('x', async () => { await fetch('http://127.0.0.1:9'); });" },
    {
      code: "import { fetch } from './client.js'; it('x', async () => { await fetch(1); });",
      options: unitOptions,
    },
    {
      code: "it('x', async () => { const fetch = vi.fn(); await fetch(1); });",
      options: unitOptions,
    },
    {
      code: "import { createServer } from 'node:http'; createServer(handler);",
      options: unitOptions,
    },
  ],
  invalid: [
    {
      code: "it('x', () => { const start = Date.now(); run(); expect(start).toBe(1); });",
      errors: [{ messageId: 'clock' }],
    },
    {
      code: "it('x', () => { expect(new Date().getFullYear()).toBe(2026); });",
      errors: [{ messageId: 'clock' }],
    },
    {
      code: "it('x', () => { expect(pick(Math.random())).toBe(1); });",
      errors: [{ messageId: 'random' }],
    },
    {
      code: "it('x', async () => { await fetch('http://127.0.0.1:9'); });",
      options: unitOptions,
      errors: [{ messageId: 'network' }],
    },
    {
      code: "import http from 'node:http'; it('x', () => { http.get('http://x'); });",
      options: unitOptions,
      errors: [{ messageId: 'network' }],
    },
    {
      code: "import { request as send } from 'https'; it('x', () => { send('https://x'); });",
      options: unitOptions,
      errors: [{ messageId: 'network' }],
    },
    {
      code: "import * as net from 'node:net'; it('x', () => { net.connect(80); });",
      options: unitOptions,
      errors: [{ messageId: 'network' }],
    },
    {
      code: "it('x', () => { const socket = new WebSocket('ws://x'); });",
      options: unitOptions,
      errors: [{ messageId: 'network' }],
    },
  ],
});

const helperFile = '/repo/test/helpers/orders-check.ts';

tester.run('no-uncollected-tests', noUncollectedTests, {
  valid: [
    { filename: '/repo/test/orders.test.ts', code: "it('x', () => {});" },
    { filename: '/repo/src/orders.spec.ts', code: "describe('x', () => { it('y', () => {}); });" },
    { filename: helperFile, code: 'export function build() { return 1; }' },
    {
      filename: helperFile,
      code: "export function sharedSuite() { describe('x', () => { it('y', () => {}); }); }",
    },
    { filename: helperFile, code: "import { it } from 'vitest'; const cases = [1];" },
  ],
  invalid: [
    { filename: helperFile, code: "it('ships', () => {});", errors: [{ messageId: 'neverRuns' }] },
    {
      filename: '/repo/test/orders-check.ts',
      code: lines("import { test } from 'vitest';", "test('a', () => {});", "test('b', () => {});"),
      errors: [{ messageId: 'neverRuns', line: 2 }],
    },
    {
      filename: '/repo/test/orders.tests.ts',
      code: "describe.skip('x', () => {});",
      errors: [{ messageId: 'neverRuns' }],
    },
    {
      filename: '/repo/test/orders.test.d.ts',
      code: "test.each([1])('x', () => {});",
      errors: [{ messageId: 'neverRuns' }],
    },
  ],
});
