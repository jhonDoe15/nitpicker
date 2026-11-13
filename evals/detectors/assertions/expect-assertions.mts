import type typescript from 'typescript';
import { type Node, type SourceFile, ts } from '../typescript.mts';

type Expression = typescript.Expression;

export type Assertion =
  | { kind: 'assert'; matcher: string; negated: false; args: readonly Expression[] }
  | {
      kind: 'expect';
      subject: Expression | undefined;
      matcher: string;
      negated: boolean;
      args: readonly Expression[];
    };

const EXPECT_FACTORIES = new Set(['soft', 'poll', 'element']);
const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual', 'equal', 'strictEqual']);
const PLAIN_KEYWORDS = new Set<typescript.SyntaxKind>([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
]);

export function isInBodySkip(call: typescript.CallExpression): boolean {
  return (
    call.arguments.length <= 1 &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'skip' &&
    ts.isIdentifier(call.expression.expression) &&
    ['ctx', 'context', 't'].includes(call.expression.expression.text)
  );
}

function isExpectCall(call: Node): call is typescript.CallExpression {
  if (!ts.isCallExpression(call)) {
    return false;
  }
  const callee = call.expression;
  return (
    (ts.isIdentifier(callee) && callee.text === 'expect') ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'expect' &&
      EXPECT_FACTORIES.has(callee.name.text))
  );
}

export function assertionOf(call: typescript.CallExpression): Assertion | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return ts.isIdentifier(call.expression) && call.expression.text === 'assert'
      ? { kind: 'assert', matcher: 'ok', negated: false, args: call.arguments }
      : undefined;
  }
  const names: string[] = [];
  let current: Expression = call.expression;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  const matcher = names.at(-1);
  if (matcher === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(current) && current.text === 'assert') {
    return { kind: 'assert', matcher, negated: false, args: call.arguments };
  }
  if (isExpectCall(current)) {
    return {
      kind: 'expect',
      subject: current.arguments[0],
      matcher,
      negated: names.includes('not'),
      args: call.arguments,
    };
  }
  return undefined;
}

export function weakMatcher(assertion: Assertion): string | undefined {
  if (assertion.kind !== 'expect') {
    return undefined;
  }
  const { matcher, negated, args } = assertion;
  const [first] = args;
  if (!negated && ['toBeDefined', 'toBeTruthy', 'toBeFalsy'].includes(matcher)) {
    return matcher;
  }
  if (negated && ['toBeUndefined', 'toBeNull', 'toBeFalsy'].includes(matcher)) {
    return `not.${matcher}`;
  }
  if (
    matcher === 'toMatchObject' &&
    first !== undefined &&
    ts.isObjectLiteralExpression(first) &&
    first.properties.length === 0
  ) {
    return 'toMatchObject({})';
  }
  if (
    ['toBe', 'toEqual', 'toStrictEqual'].includes(matcher) &&
    first !== undefined &&
    ts.isCallExpression(first) &&
    first.expression.getText() === 'expect.anything'
  ) {
    return `${matcher}(expect.anything())`;
  }
  if (
    matcher === 'toBeInstanceOf' &&
    first !== undefined &&
    ts.isIdentifier(first) &&
    first.text === 'Object'
  ) {
    return 'toBeInstanceOf(Object)';
  }
  if (matcher === 'toBeGreaterThanOrEqual' && first !== undefined && first.getText() === '0') {
    return 'toBeGreaterThanOrEqual(0)';
  }
  return undefined;
}

function isPlainValue(node: Node): boolean {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    ts.isIdentifier(node) ||
    PLAIN_KEYWORDS.has(node.kind)
  );
}

function literalTruthiness(node: Node): boolean | undefined {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
    return false;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text) !== 0;
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text.length > 0;
  }
  return undefined;
}

export function isTautology(assertion: Assertion, sourceFile: SourceFile): boolean {
  const { kind, matcher, negated, args } = assertion;
  if (negated) {
    return false;
  }
  const subject = assertion.kind === 'expect' ? assertion.subject : args[0];
  const other = kind === 'expect' ? args[0] : args[1];
  if (subject === undefined) {
    return false;
  }
  if (EQUALITY_MATCHERS.has(matcher) && other !== undefined) {
    return (
      isPlainValue(subject) &&
      isPlainValue(other) &&
      subject.getText(sourceFile) === other.getText(sourceFile)
    );
  }
  const literal = literalTruthiness(subject);
  if (literal === undefined) {
    return false;
  }
  if (['toBeTruthy', 'ok'].includes(matcher)) {
    return literal;
  }
  if (matcher === 'toBeFalsy') {
    return !literal;
  }
  return false;
}
