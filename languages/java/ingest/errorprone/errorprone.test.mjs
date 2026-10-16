import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { hashIdentity } from '../common.mjs';
import { ingestErrorProne } from './errorprone.mjs';

const REPORT = readFileSync(path.join(import.meta.dirname, '../fixtures/errorprone.json'), 'utf8');

const resolvePath = (file) =>
  file.startsWith('/project/src/') ? file.slice('/project/'.length) : undefined;

const MAIN = 'src/main/java/org/example';
const CHECK_RETURN_VALUE =
  "The result of `evaluate()` must be used. Did you mean 'var unused = expr.evaluate();' or to remove this line?";
const FUTURE =
  "Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future. Did you mean 'var unused = future.thenAccept(result -> variables.put(variable, result));' or to remove this line?";
const NULLAWAY =
  "initializer method does not guarantee @NonNull field 'expressionParser' (line 18) is initialized along all control-flow paths (remember to check for exceptions or early returns). Annotate what may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable if it uses none) and check it before use; otherwise give it a non-null value.";
const STACK =
  'Stack is a nonstandard class that predates the Java Collections Framework; prefer ArrayDeque. Note that the Stack methods push/pop/peek correspond to the Deque methods addFirst/removeFirst/peekFirst.';

const SUMMARIES = new Map([
  [CHECK_RETURN_VALUE, 'The result of `evaluate()` must be used'],
  [FUTURE, FUTURE.replace(/ Did you mean .*$/u, '')],
  [NULLAWAY, NULLAWAY.replace(/ Annotate what may be null .*$/u, '')],
]);

const identity = (rule, message) =>
  hashIdentity('errorprone', [
    rule,
    (SUMMARIES.get(message) ?? message).replace(/\bline \d+\b/g, 'line'),
  ]);

describe('ingestErrorProne', () => {
  it('turns each Error Prone diagnostic under a source root into an enforceable finding', () => {
    expect(ingestErrorProne(REPORT, { resolvePath }).findings).toEqual([
      {
        tool: 'errorprone',
        rule: 'FutureReturnValueIgnored',
        path: `${MAIN}/calculator/concurrent/DependencyGraphCalculator.java`,
        identity: identity('FutureReturnValueIgnored', FUTURE),
        message: FUTURE,
        classification: 'enforceable',
        location: { line: 40, column: 30 },
      },
      {
        tool: 'errorprone',
        rule: 'CheckReturnValue',
        path: `${MAIN}/calculator/simple/Calculator.java`,
        identity: identity('CheckReturnValue', CHECK_RETURN_VALUE),
        message:
          'The result of `evaluate()` must be used. Use the result, or make the method return void if ' +
          'callers do not need it. Did you mean to remove this line?',
        classification: 'enforceable',
        location: { line: 16, column: 26 },
      },
      {
        tool: 'errorprone',
        rule: 'NullAway',
        path: `${MAIN}/genericcalculator/ExpressionEvaluator.java`,
        identity: identity('NullAway', NULLAWAY),
        message: NULLAWAY,
        classification: 'enforceable',
        location: { line: 20, column: 12 },
      },
      {
        tool: 'errorprone',
        rule: 'JdkObsolete',
        path: `${MAIN}/openclosecalculator/ExpressionParser.java`,
        identity: identity('JdkObsolete', STACK),
        message: STACK,
        classification: 'enforceable',
        location: { line: 53, column: 30 },
      },
      {
        tool: 'errorprone',
        rule: 'JdkObsolete',
        path: `${MAIN}/openclosecalculator/ExpressionParser.java`,
        identity: `${identity('JdkObsolete', STACK)}#2`,
        message: STACK,
        classification: 'enforceable',
        location: { line: 54, column: 37 },
      },
    ]);
  });

  it('produces findings that satisfy the findings schema', () => {
    const report = ingestErrorProne(REPORT, { resolvePath });

    expect(parseAnalyzerReport(report, 'java')).toEqual(report);
  });

  it('keeps identities when code moves, including line numbers inside messages', () => {
    const moved = JSON.parse(REPORT).map((diagnostic) => ({
      ...diagnostic,
      line: diagnostic.line + 12,
      message: diagnostic.message.replace('(line 18)', '(line 30)'),
    }));
    const identities = (json) =>
      ingestErrorProne(json, { resolvePath }).findings.map((finding) => finding.identity);

    expect(identities(JSON.stringify(moved))).toEqual(identities(REPORT));
  });

  it('keeps identities when the suggested fix changes with the code', () => {
    const reformatted = JSON.parse(REPORT).map((diagnostic) => ({
      ...diagnostic,
      message: diagnostic.message.replace(/Did you mean '[^']*'/u, "Did you mean 'other code'"),
    }));
    const identities = (json) =>
      ingestErrorProne(json, { resolvePath }).findings.map((finding) => finding.identity);

    expect(identities(JSON.stringify(reformatted))).toEqual(identities(REPORT));
  });

  it('numbers repeats by position, whatever the report order', () => {
    const repeats = JSON.stringify(
      JSON.parse(REPORT)
        .filter((diagnostic) => diagnostic.message.startsWith('[JdkObsolete]'))
        .reverse(),
    );

    expect(
      ingestErrorProne(repeats, { resolvePath }).findings.map(({ identity: id, location }) => [
        id,
        location.line,
      ]),
    ).toEqual([
      [identity('JdkObsolete', STACK), 53],
      [`${identity('JdkObsolete', STACK)}#2`, 54],
    ]);
  });

  it('drops repeated diagnostics and the class-literal echo of a SunApi type, keeping other columns', () => {
    const sun = (column, name) => ({
      file: '/project/src/main/java/A.java',
      line: 8,
      column,
      message: `[SunApi] ${name} is an internal JDK API which may be removed in a future release`,
    });
    const report = [
      sun(12, 'sun.misc.Unsafe'),
      sun(18, 'class'),
      sun(37, 'sun.misc.Signal'),
      sun(43, 'class'),
      sun(37, 'sun.misc.Signal'),
      sun(60, 'class'),
    ];
    const read = (diagnostics) =>
      ingestErrorProne(JSON.stringify(diagnostics), { resolvePath }).findings.map(
        ({ message, location }) => [location.column, message.split(' ')[0]],
      );

    expect(read(report)).toStrictEqual([
      [12, 'sun.misc.Unsafe'],
      [37, 'sun.misc.Signal'],
      [60, 'class'],
    ]);
  });

  it('uses the check name when a message has no text, and omits an invalid location', () => {
    const report = JSON.stringify([
      { file: '/project/src/main/java/A.java', line: 0, message: '[DeadException]' },
    ]);

    expect(ingestErrorProne(report, { resolvePath }).findings).toEqual([
      {
        tool: 'errorprone',
        rule: 'DeadException',
        path: 'src/main/java/A.java',
        identity: identity('DeadException', 'DeadException'),
        message: 'DeadException',
        classification: 'enforceable',
      },
    ]);
  });

  it('rejects a report that is not an array of diagnostics', () => {
    expect(() => ingestErrorProne('{"diagnostics":[]}')).toThrow(
      new TypeError('Error Prone report must be a JSON array of diagnostics'),
    );
  });
});
