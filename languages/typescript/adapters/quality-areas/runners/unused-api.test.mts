import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import {
  createAnalyzerRunnerProject,
  removeAnalyzerRunnerProject,
} from './test-support/analyzer-runner-project.mts';
import { runTestOnlyExports } from './unused-api.mts';

let directory: string;
let options: QualityAreaOptions;

beforeEach(() => {
  ({ directory, options } = createAnalyzerRunnerProject({
    name: 'unused-api',
    analyzer: 'languages/typescript/preset/unused-api/analyze.mjs',
    analyzerFunction: 'analyzeUnusedApi',
    extraFiles: { 'project/src/a.test.ts': 'export const a = 1;\n' },
  }));
});

afterEach(() => {
  removeAnalyzerRunnerProject(directory);
});

describe('the unused API runners', () => {
  it('turns a failed knip run without tests into a tool error', () => {
    const runs = {
      config: { entry: [], project: [] },
      normal: { issues: [] },
      knip: () => {
        throw new Error('knip exited with 2');
      },
    };

    expect(runTestOnlyExports({ ...options, analyzerName: 'dead-code' }, runs)).toEqual([
      {
        tool: 'dead-code',
        rule: 'test-only-export',
        path: '.',
        identity: 'test-only-export',
        message: 'test-only-export could not run: knip exited with 2',
        classification: 'tool-error',
      },
    ]);
  });
});
