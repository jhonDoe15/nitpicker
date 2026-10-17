import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunnerProjects } from '../test-support/runner-project.mjs';
import { startV8Coverage } from './v8-coverage-run.mjs';

const projects = createRunnerProjects();

afterEach(() => {
  projects.remove();
});

function coverageEnvironment(target, environment) {
  const projectRoot = projects.project({
    'package.json': { name: 'p' },
    'tsconfig.json': { compilerOptions: { target } },
  });
  const coverage = startV8Coverage({ projectRoot }, { environment });
  coverage.remove();
  return {
    nodeArguments: coverage.nodeArguments,
    compilerOptions: coverage.environment.TS_NODE_COMPILER_OPTIONS,
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
