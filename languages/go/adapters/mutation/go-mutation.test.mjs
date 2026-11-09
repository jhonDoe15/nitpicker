import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGoAnalyzers } from '../go-analyzer.mjs';
import { readMutationFindings } from './go-mutation.mjs';
import { runMutant } from './mutation-run.mjs';
import { onChangedLine } from './mutation-scope.mjs';

const roots = [];

function snapshot(results, weakened = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'go-mutation-'));
  roots.push(root);
  mkdirSync(path.join(root, 'shop'));
  writeFileSync(
    path.join(root, 'shop/fee.go'),
    'package shop\n\nfunc Fee(total int) int {\n\tif total > 100 {\n\t\treturn 5\n\t}\n\treturn 0\n}\n',
  );
  writeFileSync(path.join(root, 'mutation.json'), JSON.stringify({ results, weakened }));
  return { projectRoot: root, reportRoot: root };
}

function mutant(overrides) {
  return {
    file: 'shop/fee.go',
    line: 4,
    column: 11,
    start: 50,
    end: 51,
    operator: 'EqualityOperator',
    original: '>',
    replacement: '>=',
    function: 'Fee',
    changed: true,
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Go mutation findings', () => {
  it('reports the escaped mutants of changed lines, numbering equal mutants of a function', () => {
    const findings = readMutationFindings(
      snapshot([
        mutant({ status: 'Survived' }),
        mutant({ status: 'Survived', line: 4, column: 30 }),
        mutant({ status: 'Killed', replacement: '<=' }),
        mutant({ status: 'NoCoverage', operator: 'ConditionalExpression', replacement: 'true' }),
        mutant({ status: 'Survived', changed: false }),
        mutant({ status: 'CompileError', operator: 'RemovedCall', replacement: '' }),
      ]),
    );
    expect(
      findings
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule, identity, symbol, location, anchor }) => ({
          rule,
          identity,
          symbol,
          location,
          anchored: anchor?.requireUnchangedLine,
        })),
    ).toEqual([
      {
        rule: 'mutant-survived',
        identity: 'Fee|EqualityOperator|>→>=#1',
        symbol: 'Fee',
        location: { line: 4, column: 11 },
        anchored: true,
      },
      {
        rule: 'mutant-survived',
        identity: 'Fee|EqualityOperator|>→>=#2',
        symbol: 'Fee',
        location: { line: 4, column: 30 },
        anchored: true,
      },
      {
        rule: 'mutant-nocoverage',
        identity: 'Fee|ConditionalExpression|>→true#1',
        symbol: 'Fee',
        location: { line: 4, column: 11 },
        anchored: true,
      },
    ]);
    expect(
      findings
        .filter(({ rule }) => rule === 'mutation-summary')
        .map(({ identity, metric }) => `${identity} ${String(metric.value)}`),
    ).toEqual([
      'status:Survived 2',
      'status:Killed 1',
      'status:NoCoverage 1',
      'status:CompileError 1',
    ]);
  });

  it('keeps the weakened-test findings and says which failing packages left mutants untested', () => {
    const weakened = { tool: 'mutation', rule: 'mutant-survived', identity: 'weakened|x' };
    const findings = readMutationFindings(
      snapshot(
        [
          mutant({ status: 'Skipped', failing: ['example.com/shop/shop'] }),
          mutant({ status: 'Skipped', failing: ['example.com/shop/api'], line: 7 }),
        ],
        [weakened],
      ),
    );
    expect(
      findings
        .filter(({ rule }) => rule !== 'mutation-summary')
        .map(({ rule, identity, message, classification }) => ({
          rule,
          identity,
          message,
          classification,
        })),
    ).toEqual([
      {
        rule: 'mutant-survived',
        identity: 'weakened|x',
        message: undefined,
        classification: undefined,
      },
      {
        rule: 'mutation-skipped',
        identity: 'mutation-skipped:failing-tests',
        message:
          'Mutation testing skipped 2 mutants: the tests of example.com/shop/api, example.com/shop/shop fail. Fix the tests and rerun.',
        classification: 'descriptive',
      },
    ]);
  });

  it('mutates every line without a base and only the changed lines with one', () => {
    const scope = { all: false, changed: new Map([['shop/fee.go', [[4, 5]]]]) };
    expect(
      [mutant({ line: 4 }), mutant({ line: 6 }), mutant({ file: 'shop/rate.go' })].map((entry) =>
        onChangedLine(scope, entry),
      ),
    ).toEqual([true, false, false]);
    expect(onChangedLine({ all: true }, mutant({ line: 6 }))).toBe(true);
    expect(onChangedLine(scope, mutant({ line: 2, endLine: 4 }))).toBe(true);
  });

  it('runs mutation as an analyzer of its own after the go analyzer, so it can be disabled', () => {
    const [go, mutation] = createGoAnalyzers({});
    expect([go.name, mutation.name, mutation.dependencies, mutation.reportedTools]).toEqual([
      'go',
      'mutation',
      ['go'],
      ['mutation'],
    ]);
    expect(mutation.createInvocation({ projectRoot: '/p', toolRoot: '/t' }).args.slice(1)).toEqual([
      'go-analyzer',
      '--project-root',
      '/p',
      '--part',
      'mutation',
    ]);
  });

  it('reads a timeout from any test of the run, since parallel tests print the panic elsewhere', () => {
    const context = snapshot([]);
    const events = [
      { Action: 'run', Package: 'example.com/shop/shop', Test: 'TestSpin' },
      {
        Action: 'output',
        Package: 'example.com/shop/shop',
        Test: 'TestSpin',
        Output: 'panic: test timed out after 30s\n',
      },
      { Action: 'pass', Package: 'example.com/shop/shop', Test: 'TestSpin' },
      { Action: 'fail', Package: 'example.com/shop/shop' },
    ];
    const calls = [];
    const spawn = (program, args) => {
      calls.push(args.filter((arg) => !arg.startsWith('-overlay=')));
      return { status: 1, stdout: events.map((event) => JSON.stringify(event)).join('\n') };
    };
    const status = runMutant(
      { ...context, spawn, environment: {}, settings: {} },
      {
        mutant: mutant({}),
        directory: '0',
        packages: ['example.com/shop/shop'],
        seconds: new Map([['example.com/shop/shop', 10]]),
      },
    );
    expect([status, calls]).toEqual([
      'Timeout',
      [
        [
          'test',
          '-json',
          '-vet=off',
          '-count=1',
          '-failfast',
          '-timeout=50s',
          'example.com/shop/shop',
        ],
      ],
    ]);
  });
});
