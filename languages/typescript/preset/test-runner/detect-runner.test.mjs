import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectTestRunner, testRunnerFor } from './detect-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(manifest, files = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const file of files) {
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

describe('the test runner a project uses', () => {
  it.each([
    ['vitest run', 'vitest'],
    ['npx vitest --run --typecheck', 'vitest'],
    ['NODE_OPTIONS=--experimental-vm-modules jest --coverage', 'jest'],
    ['react-scripts test', 'jest'],
    ['mocha --require test/support/env test/', 'mocha'],
    ['nyc mocha', 'mocha'],
    ['node --test', 'node'],
    ['tsx --test test/', 'node'],
    ['c8 node --import tsx --test "test/**/*.test.ts"', 'node'],
    ['borp --coverage', 'node'],
    ['tsc && vitest run', 'vitest'],
  ])('reads the test script %j as %s', (command, runner) => {
    const root = project({ scripts: { test: command }, devDependencies: { jest: '30' } });

    expect(detectTestRunner(root)).toEqual({
      runner,
      evidence: 'package.json script "test"',
      command,
    });
  });

  it('follows a test script that runs another script', () => {
    const root = project({ scripts: { test: 'npm run test:unit', 'test:unit': 'jest' } });

    expect(detectTestRunner(root)).toEqual({
      runner: 'jest',
      evidence: 'package.json script "test"',
      command: 'jest',
    });
  });

  it('reads another test script when the test script names no runner', () => {
    const root = project({ scripts: { test: 'echo none', 'test:node': 'node --test' } });

    expect(detectTestRunner(root)).toEqual({
      runner: 'node',
      evidence: 'package.json script "test:node"',
      command: 'node --test',
    });
  });

  it('does not loop on scripts that run each other', () => {
    const root = project({ scripts: { test: 'npm run a', a: 'npm run test' } });

    expect(detectTestRunner(root).runner).toBe('vitest');
  });

  it.each([
    ['jest.config.ts', 'jest'],
    ['.mocharc.yml', 'mocha'],
    ['vitest.config.mts', 'vitest'],
  ])('falls back to the config file %s', (file, runner) => {
    expect(detectTestRunner(project({}, [file]))).toEqual({ runner, evidence: file });
  });

  it('reads a runner config kept in package.json', () => {
    expect(detectTestRunner(project({ jest: { testEnvironment: 'node' } }))).toEqual({
      runner: 'jest',
      evidence: 'package.json "jest"',
    });
  });

  it('falls back to the runner dependency, then to Vitest', () => {
    expect(detectTestRunner(project({ devDependencies: { mocha: '11' } }))).toEqual({
      runner: 'mocha',
      evidence: 'the mocha dependency',
    });
    expect(detectTestRunner(project({}))).toEqual({ runner: 'vitest', evidence: 'the default' });
  });

  it('uses the configured runner and the matching test script', () => {
    const root = project({ scripts: { test: 'jest --runInBand' } });

    expect(testRunnerFor(root, 'jest')).toEqual({
      runner: 'jest',
      evidence: 'nitpicker.config.json "tools.tests.runner"',
      command: 'jest --runInBand',
    });
    expect(testRunnerFor(root, 'node')).toEqual({
      runner: 'node',
      evidence: 'nitpicker.config.json "tools.tests.runner"',
      command: undefined,
    });
  });
});
