import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  isUntypedRunnerGlobal,
  missingRunnerTypes,
  runnerTypes,
  runnerTypesNotices,
  withRunnerTypes,
} from './runner-types.mjs';

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

describe('a runner whose types package is missing', () => {
  const TYPE_CHECK = [{ name: 'typescript-typecheck' }];
  function diagnostic(code, text, name) {
    return { code, file: { text }, start: text.indexOf(name), length: name.length };
  }

  it('names the package the Jest and Mocha globals need, and nothing for the others', () => {
    const bare = projectWith([]);

    expect(
      ['vitest', 'jest', 'mocha', 'node'].map((runner) => missingRunnerTypes(runner, bare)),
    ).toEqual([undefined, '@types/jest', '@types/mocha', undefined]);
    expect(missingRunnerTypes('jest', projectWith(['@types/jest']))).toBe(undefined);
  });

  it('tells a test runner global apart from any other unknown name', () => {
    const text = 'describe("a", () => { it("b", () => { expect(missing).toBe(1); }); });';

    expect([
      isUntypedRunnerGlobal(diagnostic(2582, text, 'describe'), 'jest'),
      isUntypedRunnerGlobal(diagnostic(2593, text, 'describe'), 'mocha'),
      isUntypedRunnerGlobal(diagnostic(2304, text, 'expect'), 'jest'),
      isUntypedRunnerGlobal(diagnostic(2304, text, 'missing'), 'jest'),
      isUntypedRunnerGlobal(diagnostic(2304, text, 'expect'), 'mocha'),
      isUntypedRunnerGlobal(diagnostic(2322, text, 'describe'), 'mocha'),
    ]).toEqual([true, true, true, false, false, false]);
  });

  it('gives a notice naming the package, only when the type check runs', () => {
    const projectDirectory = projectWith([]);

    expect(runnerTypesNotices('mocha', { projectDirectory, analyzers: TYPE_CHECK })).toEqual([
      'The project runs its tests with Mocha, but @types/mocha is not installed, so the type ' +
        'check does not know the Mocha globals and does not report the errors they cause in ' +
        'test files. Install @types/mocha (npm install --save-dev @types/mocha) to have the ' +
        'tests type checked against them.',
    ]);
    expect(
      runnerTypesNotices('mocha', { projectDirectory, analyzers: [{ name: 'eslint' }] }),
    ).toEqual([]);
    expect(runnerTypesNotices('vitest', { projectDirectory, analyzers: TYPE_CHECK })).toEqual([]);
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
