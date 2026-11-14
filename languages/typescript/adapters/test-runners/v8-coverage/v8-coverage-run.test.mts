import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunnerProjects } from '../test-support/runner-project.mts';
import { startV8Coverage } from './v8-coverage-run.mts';
import { testOptions } from '../typed/test-options.mts';
import type { Environment } from '../typed/runner-types.mts';

const projects = createRunnerProjects();

afterEach(() => {
  projects.remove();
});

function coverageEnvironment(
  target: string,
  environment: Environment,
): { readonly nodeArguments: readonly string[]; readonly compilerOptions: string | undefined } {
  const projectRoot = projects.project({
    'package.json': { name: 'p' },
    'tsconfig.json': { compilerOptions: { target } },
  });
  const coverage = startV8Coverage(testOptions({ projectRoot }), {
    environment,
    arguments_: [],
    nodeArguments: [],
  });
  coverage.remove();
  return {
    nodeArguments: coverage.nodeArguments,
    compilerOptions: coverage.environment['TS_NODE_COMPILER_OPTIONS'],
  };
}

describe('the node options of a coverage run', () => {
  it('preloads the source recorder with --require so require hooks still load the tests', () => {
    expect(coverageEnvironment('es2022', {}).nodeArguments).toEqual([
      '--require',
      path.join(import.meta.dirname, 'loaded-sources.cjs'),
    ]);
  });

  it('raises the ts-node target below ES2022 and keeps the class field semantics', () => {
    expect(coverageEnvironment('es2017', { TS_NODE_COMPILER_OPTIONS: '{"strict":true}' })).toEqual({
      nodeArguments: ['--require', path.join(import.meta.dirname, 'loaded-sources.cjs')],
      compilerOptions: '{"strict":true,"target":"es2022","useDefineForClassFields":false}',
    });
    expect(coverageEnvironment('es2022', {}).compilerOptions).toBeUndefined();
  });
});
