import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../../preset/layout.mjs';
import { mutationConfigFor, mutationEnvironmentFor } from './mutation-config.mjs';

const temporaryRoots = [];
const VITEST_PLUGIN = '/nitpicker/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js';
const CHECKER_PLUGIN =
  '/nitpicker/node_modules/@stryker-mutator/typescript-checker/dist/src/index.js';
const sourceConfig = {
  mutate: ['src/**/*.ts'],
  plugins: [VITEST_PLUGIN, CHECKER_PLUGIN],
  testRunner: 'vitest',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.stryker.json',
  coverageAnalysis: 'perTest',
  vitest: { configFile: 'vitest.quality.config.ts', related: false },
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-config-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function pluginPath(name) {
  return fileURLToPath(import.meta.resolve(name));
}

describe('mutation config for a Jest project', () => {
  it('swaps the Vitest runner for the Jest runner and keeps the rest', () => {
    const projectRoot = projectWith({ 'package.json': '{"name":"p"}' });

    expect(
      mutationConfigFor('jest', {
        sourceConfig,
        tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
        projectRoot,
        layout: resolveLayout(),
      }),
    ).toEqual({
      mutate: ['src/**/*.ts'],
      plugins: [CHECKER_PLUGIN, pluginPath('@stryker-mutator/jest-runner')],
      testRunner: 'jest',
      jest: { projectType: 'custom' },
      checkers: ['typescript'],
      tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
      coverageAnalysis: 'perTest',
    });
  });
});

describe('mutation config for a node:test project', () => {
  it('runs each test file under the tap runner with the flags of the test script', () => {
    const projectRoot = projectWith({
      'package.json': JSON.stringify({ scripts: { test: 'node --import tsx --test test/' } }),
      'test/a.test.ts': '',
      'test/helper.ts': '',
      'src/main/b.spec.ts': '',
      'src/main/b.ts': '',
    });

    expect(
      mutationConfigFor('node-test', {
        sourceConfig,
        tsconfigFile: 'tsconfig.stryker.json',
        projectRoot,
        layout: resolveLayout(),
      }),
    ).toEqual({
      mutate: ['src/**/*.ts'],
      plugins: [CHECKER_PLUGIN, pluginPath('@stryker-mutator/tap-runner')],
      testRunner: 'tap',
      tap: {
        testFiles: ['src/main/b.spec.ts', 'test/a.test.ts'],
        nodeArgs: ['--import', 'tsx', '--test-reporter=tap'],
      },
      checkers: ['typescript'],
      tsconfigFile: 'tsconfig.stryker.json',
      coverageAnalysis: 'perTest',
    });
  });
});

describe('mutation environment', () => {
  it('turns on native ESM for a Jest project whose test script does', () => {
    const projectRoot = projectWith({
      'package.json': JSON.stringify({
        scripts: { test: 'node --experimental-vm-modules node_modules/jest/bin/jest.js' },
      }),
    });

    expect(mutationEnvironmentFor('jest', projectRoot)).toEqual({
      NODE_OPTIONS: expect.stringContaining('--experimental-vm-modules'),
    });
  });

  it.each(['vitest', 'node-test'])('adds nothing for %s', (runner) => {
    expect(mutationEnvironmentFor(runner, '/unused')).toEqual({});
  });
});
