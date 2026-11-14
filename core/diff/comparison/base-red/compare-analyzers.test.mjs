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

describe('a head whose tests fail in one module while the analyzer keeps its other findings', () => {
  const headFailure = {
    tool: 'tests',
    rule: 'tests-failed',
    path: '.',
    identity: 'tests-failed:shop',
    symbol: 'shop',
    message: '1 test fails in shop; coverage, CRAP and mutation were skipped there.',
    classification: 'tool-error',
  };
  const finding = (rule, file) => ({
    tool: rule === 'UnusedPrivateField' ? 'pmd' : 'pit',
    rule,
    path: file,
    identity: `${rule}:${file}`,
    message: rule,
    classification: 'enforceable',
    location: { line: 3 },
  });
  const MUTANT = finding('mutant-survived', 'shop/src/Cart.java');
  const OTHER_MUTANT = finding('mutant-survived', 'web/src/Page.java');
  const PMD = finding('UnusedPrivateField', 'shop/src/Cart.java');
  const NEW_PMD = finding('UnusedPrivateField', 'shop/src/Order.java');

  function comparedSides(baseFindings, headFindings) {
    const toolErrors = [];
    const { outcomes, notes } = compareAnalyzers({
      analyzers: [{ name: 'java' }],
      baseRun: run(baseFindings),
      headRun: run(headFindings),
      toolErrors,
      touchedCode: { changedLines: new Map(), isStrictRule: () => false },
    });
    const { result } = outcomes[0];
    return {
      new: result.newFindings.map(({ identity }) => identity),
      unchanged: result.unchangedFindings.map(({ identity }) => identity),
      resolved: result.resolvedFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(({ tool, snapshot, rule }) => `${tool} ${snapshot} ${rule}`),
      notes: notes.map(({ snapshot, rule }) => `${snapshot} ${rule}`),
    };
  }

  it('compares the other findings and resolves no test result of that module', () => {
    expect(comparedSides([MUTANT, OTHER_MUTANT, PMD], [headFailure, PMD, NEW_PMD])).toEqual({
      new: [NEW_PMD.identity],
      unchanged: [PMD.identity],
      resolved: [OTHER_MUTANT.identity],
      toolErrors: ['tests head tests-failed'],
      notes: [],
    });
  });

  it('counts no test result of that module on the head as new either', () => {
    const slow = { ...finding('slow-test', 'shop/src/CartTest.java'), tool: 'test-times' };

    expect(comparedSides([PMD], [headFailure, PMD, slow]).new).toEqual([]);
  });

  it('still reads a base whose tests fail too as a red base', () => {
    const baseFailure = {
      ...headFailure,
      tool: 'java',
      message: 'Tests fail on the base in shop:',
    };

    expect(comparedSides([baseFailure, PMD], [headFailure, PMD, NEW_PMD])).toEqual({
      new: [NEW_PMD.identity],
      unchanged: [PMD.identity],
      resolved: [],
      toolErrors: ['tests head tests-failed'],
      notes: ['base tests-failed'],
    });
  });

  it('reads a build that timed out on either side like failing tests of the whole analyzer', () => {
    const timedOut = { ...headFailure, rule: 'tests-timed-out', symbol: '.' };

    expect([
      comparedSides([MUTANT, PMD], [{ ...timedOut }, PMD, NEW_PMD]),
      comparedSides([{ ...timedOut, tool: 'java' }, PMD], [PMD, NEW_PMD, OTHER_MUTANT]),
    ]).toEqual([
      {
        new: [NEW_PMD.identity],
        unchanged: [PMD.identity],
        resolved: [],
        toolErrors: ['tests head tests-timed-out'],
        notes: [],
      },
      {
        new: [NEW_PMD.identity],
        unchanged: [OTHER_MUTANT.identity, PMD.identity],
        resolved: [],
        toolErrors: [],
        notes: ['base tests-timed-out'],
      },
    ]);
  });

  it('blocks the comparison as before when the failing tests are the analyzer own tool error', () => {
    expect(comparedSides([PMD], [{ ...headFailure, tool: 'java' }, PMD, NEW_PMD]).new).toEqual([]);
  });
});
