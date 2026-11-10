import { describe, expect, it } from 'vitest';
import { compareAnalyzers } from './compare-analyzers.mjs';

const COMPILE_ERROR = {
  tool: 'build',
  rule: 'compile-error',
  path: 'src/A.java',
  identity: 'compile-error:1',
  message: 'cannot find symbol.',
  classification: 'enforceable',
  location: { line: 3 },
};
const STOPPED = {
  tool: 'java',
  rule: 'compile-failed-skipped',
  path: '.',
  identity: 'compile-failed-skipped',
  message: 'The change does not compile.',
  classification: 'tool-error',
};
const LEGACY = { ...COMPILE_ERROR, tool: 'pmd', rule: 'UnusedPrivateField', identity: 'legacy' };

function run(findings, toolErrors = []) {
  return {
    reports: new Map(findings === undefined ? [] : [['java', { findings }]]),
    timings: new Map(),
    toolErrors,
    skipped: new Map(),
  };
}

function compared(baseRun) {
  const toolErrors = [...baseRun.toolErrors];
  const { outcomes } = compareAnalyzers({
    analyzers: [{ name: 'java' }],
    baseRun,
    headRun: run([COMPILE_ERROR, STOPPED]),
    toolErrors,
    touchedCode: { changedLines: new Map() },
  });
  return {
    new: outcomes[0].result.newFindings.map(({ rule }) => rule),
    resolved: outcomes[0].result.resolvedFindings.length,
    toolErrors: toolErrors.map(({ snapshot, rule }) => `${snapshot} ${rule}`),
  };
}

describe('a head that stopped at compile errors', () => {
  it('compares with no base findings, so nothing is resolved', () => {
    expect(compared(run([LEGACY]))).toEqual({
      new: ['compile-error'],
      resolved: 0,
      toolErrors: ['head compile-failed-skipped'],
    });
  });

  it('still reports its compile errors when the base has no report of the analyzer', () => {
    expect(compared(run(undefined)).new).toEqual(['compile-error']);
  });

  it('keeps the compile errors next to a base whose tests fail', () => {
    const failing = { ...STOPPED, rule: 'tests-failed', identity: 'tests-failed' };

    expect(compared(run([LEGACY, failing])).new).toEqual(['compile-error']);
  });

  it('reports nothing new when the base does not build either', () => {
    const broken = { tool: 'java', snapshot: 'base', rule: 'gradle-failure', message: 'broken' };

    expect(compared(run([], [broken]))).toEqual({
      new: [],
      resolved: 0,
      toolErrors: ['base gradle-failure', 'head compile-failed-skipped'],
    });
  });
});
