import { describe, expect, it } from 'vitest';
import {
  createAnalyzerRunnerProject,
  removeAnalyzerRunnerProject,
} from '../test-support/analyzer-runner-project.mts';
import { runTypedStructure } from './typed-structure.mts';

const ANALYZER = 'languages/typescript/preset/design/typed-structure.mjs';

async function runWith(body?: string): Promise<unknown> {
  const project = createAnalyzerRunnerProject({
    name: 'typed-structure',
    analyzer: ANALYZER,
    analyzerFunction: 'analyzeTypedStructure',
    ...(body === undefined ? {} : { body }),
  });
  try {
    return await runTypedStructure(project.options);
  } finally {
    removeAnalyzerRunnerProject(project.directory);
  }
}

function toolError(rule: string, message: string) {
  return {
    tool: 'structure',
    rule,
    path: '.',
    identity: rule,
    message: `${rule} could not run: ${message}`,
    classification: 'tool-error',
  };
}

describe('the typed structure runner', () => {
  it('turns a failed analysis into a tool error for each typed check', async () => {
    expect(await runWith()).toEqual([
      toolError('unused-api', 'no program'),
      toolError('design-signals', 'no program'),
    ]);
  });

  it('keeps the findings of one check when the other one failed', async () => {
    expect(
      await runWith("return { 'unused-api': [], 'design-signals': { error: 'no types' } };"),
    ).toEqual([toolError('design-signals', 'no types')]);
  });
});
