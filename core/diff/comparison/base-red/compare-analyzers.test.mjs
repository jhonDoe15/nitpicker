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

describe('a PIT run that failed on one side', () => {
  const failure = {
    tool: 'pit',
    rule: 'pit-failure',
    path: '.',
    identity: 'pit-failure:shop',
    symbol: 'shop',
    message: 'PIT failed with exit code 1: boom',
    classification: 'tool-error',
  };
  const mutant = (file, line) => ({
    tool: 'pit',
    rule: 'mutant-survived',
    path: file,
    identity: `mutant:${file}:${String(line)}`,
    message: 'survived',
    classification: 'enforceable',
    location: { line },
  });
  const OLD = mutant('shop/src/Cart.java', 3);
  const EDITED = mutant('shop/src/Cart.java', 9);
  const ELSEWHERE = mutant('web/src/Page.java', 3);

  function comparedSides(baseFindings, headFindings) {
    const toolErrors = [];
    const { outcomes } = compareAnalyzers({
      analyzers: [{ name: 'java' }],
      baseRun: run(baseFindings),
      headRun: run(headFindings),
      toolErrors,
      touchedCode: {
        changedLines: new Map([['shop/src/Cart.java', { added: false, ranges: [[9, 9]] }]]),
      },
    });
    const { result } = outcomes[0];
    return {
      new: result.newFindings.map(({ identity }) => identity),
      unchanged: result.unchangedFindings.map(({ identity }) => identity),
      resolved: result.resolvedFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    };
  }

  it('counts mutants of that module as new only on changed lines when the base failed', () => {
    expect(comparedSides([failure], [OLD, EDITED, ELSEWHERE])).toEqual({
      new: [EDITED.identity, ELSEWHERE.identity],
      unchanged: [OLD.identity],
      resolved: [],
      toolErrors: ['base pit-failure'],
    });
  });

  it('resolves no mutant of that module when the head failed', () => {
    expect(comparedSides([OLD, ELSEWHERE], [failure])).toEqual({
      new: [],
      unchanged: [],
      resolved: [ELSEWHERE.identity],
      toolErrors: ['head pit-failure'],
    });
  });
});

describe('a head with a tool error of a tool of its own', () => {
  const finding = (tool, identity) => ({
    tool,
    rule: `rule-${identity}`,
    path: 'src/A.java',
    identity,
    message: 'm',
    classification: 'enforceable',
    location: { line: 1 },
  });
  const skipped = (tool) => ({
    tool,
    rule: 'tool-skipped',
    path: '.',
    identity: 'tool-skipped',
    message: `${tool} did not run.`,
    classification: 'tool-error',
  });
  const testsFailed = { ...skipped('tests'), rule: 'tests-failed', identity: 'tests-failed' };

  function comparedWith(baseFindings, headFindings) {
    const toolErrors = [];
    const { outcomes } = compareAnalyzers({
      analyzers: [{ name: 'java' }],
      baseRun: { ...run(baseFindings), toolErrors: [] },
      headRun: run(headFindings),
      toolErrors,
      touchedCode: { changedLines: new Map(), isStrictRule: () => false },
    });
    return {
      new: outcomes[0].result.newFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(({ tool, rule }) => `${tool} ${rule}`),
    };
  }

  it('keeps comparing the findings of the other tools when the head tests fail', () => {
    expect(comparedWith([], [finding('pmd', 'a'), testsFailed])).toEqual({
      new: ['a'],
      toolErrors: ['tests tests-failed'],
    });
  });

  it('leaves out only the skipped tool of the head, on both snapshots', () => {
    expect(
      comparedWith(
        [finding('pmd', 'a')],
        [
          finding('pmd', 'a'),
          finding('pmd', 'b'),
          finding('errorprone', 'c'),
          skipped('errorprone'),
        ],
      ),
    ).toEqual({ new: ['b'], toolErrors: ['errorprone tool-skipped'] });
  });

  it('leaves out the findings of a tool skipped on the base only', () => {
    expect(
      comparedWith(
        [finding('errorprone', 'c'), skipped('errorprone')],
        [finding('errorprone', 'd')],
      ),
    ).toEqual({ new: [], toolErrors: ['errorprone tool-skipped'] });
  });
});
