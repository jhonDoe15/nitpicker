import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { jestConfigFile, readJestConfig } from './read-jest-config.mjs';

const repositoryJest = path.join(import.meta.dirname, '../../../../../node_modules/jest');
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
  it('returns the resolved configuration from the package.json jest key', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p', jest: { testEnvironment: 'node' } }),
    });

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000 });

    expect(failure).toBeUndefined();
    expect(config.configs).toHaveLength(1);
    expect(config.configs[0].testEnvironment).toMatch(/jest-environment-node/u);
  });

  it('reports a configuration jest cannot load, with the first lines of its error', () => {
    const root = projectWith({
      'package.json': JSON.stringify({ name: 'p' }),
      'jest.config.json': '{ not json',
    });

    const { config, failure } = readJestConfig({ projectRoot: root, timeoutMs: 20_000 });

    expect(config).toBeUndefined();
    expect(failure).toMatch(/^jest --showConfig exited with code 1: /u);
  });

  it('reports a project without jest', () => {
    const root = projectWith({ 'package.json': '{}' }, { jest: false });

    const { config, failure } = readJestConfig({
      projectRoot: root,
      liveProjectRoot: root,
      timeoutMs: 20_000,
    });

    expect(config).toBeUndefined();
    expect(failure).toMatch(/^jest could not be resolved from the project \(/u);
  });
});
