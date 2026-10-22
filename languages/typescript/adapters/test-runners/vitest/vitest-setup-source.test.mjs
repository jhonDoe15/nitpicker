import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { expect, it } from 'vitest';
import { applyVitestTimeouts, timeoutSetupSource } from './test-timeouts-setup.mjs';

it('writes valid setup imports when the install directory contains an apostrophe', () => {
  const root = path.resolve("owner's nitpicker");
  const module = parse(timeoutSetupSource(root), { ecmaVersion: 'latest', sourceType: 'module' });
  expect(
    module.body
      .filter((node) => node.type === 'ImportDeclaration')
      .map((node) => node.source.value),
  ).toEqual([
    'vitest',
    pathToFileURL(
      path.join(root, 'languages/typescript/adapters/test-runners/vitest/test-timeouts-setup.mjs'),
    ).href,
    pathToFileURL(path.join(root, 'shared/head-policy.mjs')).href,
  ]);
});

it('passes configured project timers to the Vitest worker and omits native hooks', () => {
  const configured = [];
  const configure = (settings) => {
    configured.push(settings);
  };
  applyVitestTimeouts({}, { file: '/repo/test/a.test.mjs', root: '/repo' }, configure);
  applyVitestTimeouts(
    { tools: { tests: { timeouts: { defaults: { testTimeoutMs: 2000, hookTimeoutMs: 3000 } } } } },
    { file: '/repo/test/a.test.mjs', root: '/repo' },
    configure,
  );
  expect(configured).toEqual([{ testTimeout: 40000 }, { testTimeout: 2000, hookTimeout: 3000 }]);
});
