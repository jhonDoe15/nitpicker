import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import {
  createAnalyzerRunnerProject,
  removeAnalyzerRunnerProject,
} from '../test-support/analyzer-runner-project.mts';
import { runDesignSignals } from './design-signals.mts';

let directory: string;
let options: QualityAreaOptions;

beforeEach(() => {
  ({ directory, options } = createAnalyzerRunnerProject({
    name: 'design',
    analyzer: 'languages/typescript/preset/design/analyze.mjs',
    analyzerFunction: 'analyzeDesignSignals',
  }));
});

afterEach(() => {
  removeAnalyzerRunnerProject(directory);
});

describe('the design signals runner', () => {
  it('turns a failed analysis into a tool error instead of failing the analyzer', async () => {
    expect(await runDesignSignals(options)).toEqual([
      {
        tool: 'structure',
        rule: 'design-signals',
        path: '.',
        identity: 'design-signals',
        message: 'design-signals could not run: no program',
        classification: 'tool-error',
      },
    ]);
  });
});
