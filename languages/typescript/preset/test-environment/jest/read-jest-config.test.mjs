import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runnerCommand } from '../../test-runner/script-command.mjs';
import { jestConfigFile, readJestConfig } from './read-jest-config.mjs';

const repositoryJest = path.join(import.meta.dirname, '../../../../../node_modules/jest');
const FAKE_REACT_SCRIPTS = [
  "const { spawnSync } = require('node:child_process');",
  "const path = require('node:path');",
  `const jest = ${JSON.stringify(path.join(repositoryJest, 'bin/jest.js'))};`,
  "const setup = ['--setupFilesAfterEnv', path.join(process.cwd(), 'src/setupTests.js')];",
  'const tokens = process.argv.slice(3);',
  "const result = spawnSync(process.execPath, [jest, ...setup, ...tokens], { stdio: 'inherit' });",
  'process.exit(result.status);',
  '',
].join('\n');
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files, { jest = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-read-jest-config-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  if (jest) {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    symlinkSync(repositoryJest, path.join(root, 'node_modules/jest'), 'dir');
  }
  return root;
}

describe('jestConfigFile', () => {
  it.each(['jest.config.js', 'jest.config.ts', 'jest.config.json'])('finds %s', (name) => {
    expect(jestConfigFile(projectWith({ [name]: '{}' }, { jest: false }))).toBe(name);
  });

  it('falls back to package.json for an inline jest key', () => {
    expect(jestConfigFile(projectWith({ 'package.json': '{}' }, { jest: false }))).toBe(
      'package.json',
    );
  });
});

describe('readJestConfig', () => {
  it('runs the test script, with the config it names and the options it passes', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p' }),
      'config/custom.config.cjs':
        "module.exports = { rootDir: '..', setupFiles: ['<rootDir>/a.js'] };",
      'a.js': '',
    });
    const command = runnerCommand('jest -c config/custom.config.cjs --testTimeout=1', 'jest');

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000, command });

    expect(failure).toBeUndefined();
    expect(config.configs[0].setupFiles).toEqual([path.join(root, 'a.js')]);
    expect(jestConfigFile(root, command)).toBe(path.normalize('config/custom.config.cjs'));
  });

  it('runs Jest through the react-scripts launcher of the test script', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p' }),
      'src/setupTests.js': '',
      'node_modules/react-scripts/package.json': JSON.stringify({ name: 'react-scripts' }),
      'node_modules/react-scripts/bin/react-scripts.js': FAKE_REACT_SCRIPTS,
    });
    const command = runnerCommand('react-scripts test', 'jest');

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000, command });

    expect(failure).toBeUndefined();
    expect(config.configs[0].setupFilesAfterEnv).toEqual([path.join(root, 'src/setupTests.js')]);
  });

  it('reports a launcher that is not installed', () => {
    const root = projectWith({ 'package.json': JSON.stringify({ name: 'p' }) });

    const { failure } = readJestConfig({
      projectRoot: root,
      timeoutMs: 20_000,
      command: runnerCommand('craco test', 'jest'),
    });

    expect(failure).toBe(
      `The test script runs "craco test", but @craco/craco is not installed in ${root}. Install the project dependencies, or set "tools.tests.runner" in nitpicker.config.json.`,
    );
  });

  it('returns the resolved configuration from the package.json jest key', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p', jest: { testEnvironment: 'node' } }),
    });

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000 });

    expect(failure).toBeUndefined();
    expect(config.configs).toHaveLength(1);
    expect(config.configs[0].testEnvironment).toBe(
      path.join(repositoryJest, '../jest-environment-node/build/index.js'),
    );
  });

  it('reports a configuration jest cannot load, with the first lines of its error', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p' }),
      'jest.config.json': '{ not json',
    });

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000 });

    expect(config).toBeUndefined();
    expect(failure).toMatch(
      /^jest --showConfig exited with code 1: JSONError: .+ while parsing '\{ not json' in .+\/jest\.config\.json at .+$/u,
    );
  });

  it('reports a project without jest', () => {
    const root = projectWith({ 'package.json': '{}' }, { jest: false });

    const { config, failure } = readJestConfig({
      projectRoot: root,
      liveProjectRoot: root,
      timeoutMs: 20_000,
    });

    expect(config).toBeUndefined();
    expect(failure).toBe(
      `jest could not be resolved from the project (Cannot find module 'jest/package.json'\nRequire stack:\n- ${root}/package.json)`,
    );
  });
});
