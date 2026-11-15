import { describe, expect, it } from 'vitest';
import type { Finding, ReportEntry } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import {
  type AnalyzerOutcome,
  type AnalyzerRun,
  type FindingComparison,
  compareAnalyzers,
} from './compare-analyzers.mts';

const COMPILE_ERROR: Finding = {
  tool: 'build',
  rule: 'compile-error',
  path: 'src/A.java',
  identity: 'compile-error:1',
  message: 'cannot find symbol.',
  classification: 'enforceable',
  location: { line: 3 },
};
const STOPPED: Finding = {
  tool: 'java',
  rule: 'compile-failed-skipped',
  path: '.',
  identity: 'compile-failed-skipped',
  message: 'The change does not compile.',
  classification: 'tool-error',
};
const LEGACY = { ...COMPILE_ERROR, tool: 'pmd', rule: 'UnusedPrivateField', identity: 'legacy' };

function run(
  findings: readonly Finding[] | undefined,
  toolErrors: readonly ReportEntry[] = [],
): AnalyzerRun {
  return {
    reports: new Map(findings === undefined ? [] : [['java', { findings }]]),
    timings: new Map(),
    toolErrors,
    skipped: new Map(),
  };
}

function resultOf(outcomes: readonly AnalyzerOutcome[]): FindingComparison {
  const [outcome] = outcomes;
  if (outcome === undefined) {
    throw new Error('expected an outcome');
  }
  return outcome.result;
}

function comparedRuns(
  baseFindings: readonly Finding[],
  headFindings: readonly Finding[],
  changedLines: ReadonlyMap<string, unknown> = new Map(),
) {
  const toolErrors: ReportEntry[] = [];
  const { outcomes, notes } = compareAnalyzers({
    analyzers: [{ name: 'java' }],
    baseRun: run(baseFindings),
    headRun: run(headFindings),
    toolErrors,
    touchedCode: { changedLines, isStrictRule: () => false },
  });
  return { result: resultOf(outcomes), notes, toolErrors };
}

function compared(baseRun: AnalyzerRun) {
  const toolErrors: ReportEntry[] = [...baseRun.toolErrors];
  const { outcomes } = compareAnalyzers({
    analyzers: [{ name: 'java' }],
    baseRun,
    headRun: run([COMPILE_ERROR, STOPPED]),
    toolErrors,
    touchedCode: { changedLines: new Map() },
  });
  return {
    new: resultOf(outcomes).newFindings.map(({ rule }) => rule),
    resolved: resultOf(outcomes).resolvedFindings.length,
    toolErrors: toolErrors.map(({ snapshot, rule }) => `${textOf(snapshot)} ${textOf(rule)}`),
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
    const broken: ReportEntry = {
      tool: 'java',
      snapshot: 'base',
      rule: 'gradle-failure',
      message: 'broken',
    };

    expect(compared(run([], [broken]))).toEqual({
      new: [],
      resolved: 0,
      toolErrors: ['base gradle-failure', 'head compile-failed-skipped'],
    });
  });
});

describe('a PIT run that failed on one side', () => {
  const failure: Finding = {
    tool: 'pit',
    rule: 'pit-failure',
    path: '.',
    identity: 'pit-failure:shop',
    symbol: 'shop',
    message: 'PIT failed with exit code 1: boom',
    classification: 'tool-error',
  };
  const mutant = (file: string, line: number): Finding => ({
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

  function comparedSides(baseFindings: readonly Finding[], headFindings: readonly Finding[]) {
    const { result, toolErrors } = comparedRuns(
      baseFindings,
      headFindings,
      new Map([['shop/src/Cart.java', { added: false, ranges: [[9, 9]] }]]),
    );
    return {
      new: result.newFindings.map(({ identity }) => identity),
      unchanged: result.unchangedFindings.map(({ identity }) => identity),
      resolved: result.resolvedFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(({ snapshot, rule }) => `${textOf(snapshot)} ${textOf(rule)}`),
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
  function finding(tool: string, identity: string): Finding {
    return {
      tool,
      rule: `rule-${identity}`,
      path: 'src/A.java',
      identity,
      message: 'm',
      classification: 'enforceable',
      location: { line: 1 },
    };
  }
  function skipped(tool: string): Finding {
    return {
      tool,
      rule: 'tool-skipped',
      path: '.',
      identity: 'tool-skipped',
      message: `${tool} did not run.`,
      classification: 'tool-error',
    };
  }
  const testsFailed = { ...skipped('tests'), rule: 'tests-failed', identity: 'tests-failed' };

  function comparedWith(baseFindings: readonly Finding[], headFindings: readonly Finding[]) {
    const { result, toolErrors } = comparedRuns(baseFindings, headFindings);
    return {
      new: result.newFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(({ tool, rule }) => `${String(tool)} ${String(rule)}`),
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

describe('a head whose tests fail in one module while the analyzer keeps its other findings', () => {
  const headFailure: Finding = {
    tool: 'tests',
    rule: 'tests-failed',
    path: '.',
    identity: 'tests-failed:shop',
    symbol: 'shop',
    message: '1 test fails in shop; coverage, CRAP and mutation were skipped there.',
    classification: 'tool-error',
  };
  const finding = (rule: string, file: string): Finding => ({
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

  function comparedSides(baseFindings: readonly Finding[], headFindings: readonly Finding[]) {
    const { result, notes, toolErrors } = comparedRuns(baseFindings, headFindings);
    return {
      new: result.newFindings.map(({ identity }) => identity),
      unchanged: result.unchangedFindings.map(({ identity }) => identity),
      resolved: result.resolvedFindings.map(({ identity }) => identity),
      toolErrors: toolErrors.map(
        ({ tool, snapshot, rule }) => `${textOf(tool)} ${textOf(snapshot)} ${textOf(rule)}`,
      ),
      notes: notes.map(({ snapshot, rule }) => `${textOf(snapshot)} ${textOf(rule)}`),
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
    const baseFailure: Finding = {
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
