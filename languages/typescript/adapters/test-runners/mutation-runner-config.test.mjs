import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingSentence,
} from '../../../../shared/messages/troubleshooting.mjs';
import {
  CRACO_JEST_CONFIG,
  cracoJestConfigText,
  mutationRunnerConfig,
  unsupportedMutationRunner,
} from './mutation-runner-config.mjs';

const SOURCE_CONFIG = {
  mutate: ['src/**/*.ts'],
  plugins: ['vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.quality.config.ts' },
  checkers: ['typescript'],
  tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
};

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-runner-')));
  roots.push(root);
  for (const [file, text] of Object.entries({ 'package.json': '{}', ...files })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function mochaProject(files) {
  const root = project(files);
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}

function configFor(
  runner,
  command,
  { projectRoot = '/p', testFiles = ['/p/test/a.test.ts'] } = {},
) {
  return mutationRunnerConfig({
    options: { projectRoot },
    runner,
    command: { environment: {}, nodeArguments: [], arguments_: [], ...command },
    testFiles,
    sourceConfig: SOURCE_CONFIG,
  });
}

describe('the Stryker runner for each test runner', () => {
  it('keeps the Vitest companion config for Vitest', () => {
    const config = configFor('vitest', {});

    expect(config.testRunner).toBe('vitest');
    expect(config.vitest).toEqual({ configFile: 'vitest.quality.config.ts' });
    expect(config.plugins.map((plugin) => plugin.split('/').at(-4))).toEqual([
      'vitest-runner',
      'typescript-checker',
    ]);
  });

  it('runs Jest with its own config, a timeout fit for slow transforms, and type errors left to the checker', () => {
    const config = configFor('jest', {
      arguments_: ['--config', 'jest.unit.js'],
      nodeArguments: ['--experimental-vm-modules'],
    });

    expect({
      ...config,
      plugins: config.plugins.map((plugin) => plugin.split('/').at(-4)),
    }).toEqual({
      mutate: ['src/**/*.ts'],
      plugins: ['jest-runner', 'typescript-checker'],
      testRunner: 'jest',
      checkers: ['typescript'],
      tsconfigFile: '.nitpicker-diff-tsconfig.stryker.json',
      testRunnerNodeArgs: ['--experimental-vm-modules'],
      jest: { projectType: 'custom', enableFindRelatedTests: false, configFile: 'jest.unit.js' },
      disableTypeChecks: true,
      timeoutMS: 10_000,
      timeoutFactor: 2,
    });
  });

  it.each([
    [
      { arguments_: ['--config={"testEnvironment":"node"}'] },
      { config: { testEnvironment: 'node' } },
    ],
    [
      { launcher: 'react-scripts', arguments_: ['--config', 'x.js'] },
      { projectType: 'create-react-app' },
    ],
    [{ launcher: 'craco' }, { configFile: CRACO_JEST_CONFIG }],
  ])('loads the Jest config of the command %j', (command, source) => {
    expect(configFor('jest', command).jest).toEqual({
      projectType: 'custom',
      enableFindRelatedTests: false,
      ...source,
    });
  });

  it('builds the Jest config of a craco project the way craco test does', async () => {
    const lib = 'node_modules/@craco/craco/dist/lib';
    const root = project({
      [`${lib}/config.js`]:
        'exports.loadCracoConfigAsync = async (context) => ({ loadedFor: { ...context } });',
      [`${lib}/cra.js`]:
        "exports.getCraPaths = () => ({ appSrc: 'src' }); exports.loadJestConfigProvider = () => 'cra';",
      [`${lib}/features/jest/merge-jest-config.js`]:
        'exports.mergeJestConfig = (config, provider, context) => ({ config, provider, context });',
      [CRACO_JEST_CONFIG]: cracoJestConfigText(),
    });

    const createJestConfig = createRequire(path.join(root, 'package.json'))(
      `./${CRACO_JEST_CONFIG}`,
    );

    expect(await createJestConfig()).toEqual({
      config: { loadedFor: { env: 'test' } },
      provider: 'cra',
      context: { env: 'test', paths: { appSrc: 'src' } },
    });
  });

  it('gives Mocha the script options with their values, the .mocharc settings and the test files', () => {
    const root = mochaProject({
      '.mocharc.yml': 'require: [test/setup.js]\nspec: [test/extra.spec.js]\n',
      'test/unit/a.spec.js': '',
    });
    const config = configFor(
      'mocha',
      {
        arguments_: [
          ...['--timeout', '5000', '--reporter', 'dot', '--grep', 'fast', '-u', 'tdd'],
          ...['--ignore', 'test/integration/**', '-n', 'import=tsx', '--recursive', 'test/'],
        ],
        nodeArguments: ['--no-warnings'],
      },
      { projectRoot: root, testFiles: [path.join(root, 'test/a.test.ts')] },
    );

    expect({
      testRunnerNodeArgs: config.testRunnerNodeArgs,
      mochaOptions: config.mochaOptions,
    }).toEqual({
      testRunnerNodeArgs: ['--no-warnings', '--import=tsx'],
      mochaOptions: {
        'no-config': true,
        'no-package': true,
        require: ['test/setup.js'],
        ignore: ['test/integration/**'],
        extension: ['js', 'cjs', 'mjs'],
        ui: 'tdd',
        grep: 'fast',
        spec: ['test/**/*.{js,cjs,mjs}', 'test/extra.spec.js', 'test/a.test.ts'],
      },
    });
  });

  it("leaves Mocha's own spec in place when neither the script nor nitpicker names test files", () => {
    const root = mochaProject({ 'package.json': '{"mocha":{"require":["test/env.js"]}}' });

    expect(configFor('mocha', {}, { projectRoot: root, testFiles: [] }).mochaOptions).toEqual({
      'no-config': true,
      'no-package': true,
      require: ['test/env.js'],
      extension: ['js', 'cjs', 'mjs'],
      ui: 'bdd',
    });
  });

  it('turns --fgrep and Mocha node flags into what the Stryker runner understands', () => {
    const root = mochaProject({});
    const config = configFor(
      'mocha',
      { arguments_: ['--fgrep', 'a.b(c)', '--import=tsx', '--expose-gc', 'spec/x.js'] },
      { projectRoot: root, testFiles: [] },
    );

    expect({
      testRunnerNodeArgs: config.testRunnerNodeArgs,
      mochaOptions: config.mochaOptions,
    }).toEqual({
      testRunnerNodeArgs: ['--import=tsx', '--expose-gc'],
      mochaOptions: {
        'no-config': true,
        'no-package': true,
        extension: ['js', 'cjs', 'mjs'],
        ui: 'bdd',
        grep: String.raw`a\.b\(c\)`,
        spec: ['spec/x.js'],
      },
    });
  });

  it('explains that the Stryker Mocha runner cannot run Mocha 12', () => {
    const root = mochaProject({});

    expect(unsupportedMutationRunner({ projectRoot: root }, 'mocha')).toBe(
      "mutation skipped: Stryker's Mocha runner (@stryker-mutator/mocha-runner 10) supports Mocha up to 11, " +
        'and this project uses Mocha 12. Coverage and CRAP still run; use Mocha 11 to get mutation testing. ' +
        troubleshootingSentence(TROUBLESHOOTING_ANCHORS.mutationUnsupportedRunner),
    );
    expect(unsupportedMutationRunner({ projectRoot: root }, 'jest')).toBeUndefined();
    expect(unsupportedMutationRunner({ projectRoot: project({}) }, 'mocha')).toBeUndefined();
  });

  it('runs node:test files through the TAP runner with the node options of the script', () => {
    const config = configFor('node', {
      arguments_: ['test/**/*.test.js'],
      nodeArguments: ['--import', 'tsx'],
    });

    expect(config.testRunner).toBe('tap');
    expect(config.tap).toEqual({
      testFiles: ['test/**/*.test.js'],
      nodeArgs: ['--import', 'tsx'],
      forceBail: true,
    });
  });
});
