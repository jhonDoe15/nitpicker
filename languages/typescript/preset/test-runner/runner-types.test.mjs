import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runnerTypes, withRunnerTypes } from './runner-types.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(installed) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-types-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), '{}');
  for (const name of installed) {
    mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    writeFileSync(
      path.join(root, 'node_modules', name, 'package.json'),
      JSON.stringify({ name, version: '1.0.0' }),
    );
  }
  return root;
}

describe('runnerTypes', () => {
  it('uses the Vitest globals for a Vitest project', () => {
    expect(runnerTypes('vitest', projectWith([]))).toEqual(['vitest/globals']);
  });

  it('uses the Jest types only where @types/jest is installed', () => {
    expect(runnerTypes('jest', projectWith(['@types/jest']))).toEqual(['jest']);
    expect(runnerTypes('jest', projectWith([]))).toEqual([]);
  });

  it('uses the Mocha types only where @types/mocha is installed', () => {
    expect(runnerTypes('mocha', projectWith(['@types/mocha']))).toEqual(['mocha']);
    expect(runnerTypes('mocha', projectWith([]))).toEqual([]);
  });

  it('adds nothing for node:test, which has no globals', () => {
    expect(runnerTypes('node', projectWith(['@types/jest', '@types/mocha']))).toEqual([]);
  });
});

describe('withRunnerTypes', () => {
  const shipped = JSON.stringify({
    compilerOptions: { lib: ['ES2022'], types: ['node', 'vitest/globals'] },
  });

  it('swaps the Vitest globals for the runner types, keeping the other options', () => {
    const text = JSON.stringify({
      extends: './base.json',
      compilerOptions: { lib: ['ES2022'], types: ['node', 'vitest/globals', 'react'] },
    });

    const result = JSON.parse(
      withRunnerTypes(text, { runner: 'jest', projectDirectory: projectWith(['@types/jest']) }),
    );

    expect(result).toEqual({
      extends: './base.json',
      compilerOptions: { lib: ['ES2022'], types: ['node', 'jest', 'react'] },
    });
  });

  it('drops the Vitest globals for a runner without global types', () => {
    const result = JSON.parse(
      withRunnerTypes(shipped, { runner: 'node', projectDirectory: projectWith([]) }),
    );

    expect(result.compilerOptions.types).toEqual(['node']);
  });

  it('returns the text untouched for a Vitest project', () => {
    expect(withRunnerTypes(shipped, { runner: 'vitest', projectDirectory: projectWith([]) })).toBe(
      shipped,
    );
  });

  it.each(['{}', '{"compilerOptions":{"types":[]}}', '{"compilerOptions":{"types":["node"]}}'])(
    'leaves a config that does not name the Vitest globals as it is: %s',
    (text) => {
      expect(withRunnerTypes(text, { runner: 'jest', projectDirectory: projectWith([]) })).toBe(
        text,
      );
    },
  );
});
