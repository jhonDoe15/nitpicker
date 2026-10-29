import ts from 'typescript';
import { chainOf } from '../../../../../shared/traversal.mjs';
import { accumulatingSpreadMessageId } from '../../../preset/eslint-plugin/rules/collections/accumulating-spread-messages.mjs';
import { scriptKind } from '../../eslint/syntax.mjs';

const REDUCE_METHODS = new Set(['reduce', 'reduceRight']);
const SPREAD_LABEL = 'From this spread';
const BYTE_ORDER_MARK = '﻿';
const SPREAD_KINDS = new Set([ts.SyntaxKind.SpreadElement, ts.SyntaxKind.SpreadAssignment]);
const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);

function nativeKind({ message, help = '' }) {
  if (message.includes('in loops')) {
    return help.includes('Object.assign') ? 'loopObject' : 'loopArray';
  }
  if (help.includes('spreading an `Object`')) {
    return 'reduceObject';
  }
  return help.includes('spreading an `Array`') ? 'reduceArray' : 'reduce';
}

export function accumulatingSpreadReport(diagnostic, filePath) {
  const kind = nativeKind(diagnostic);
  const spread = diagnostic.labels?.find(({ label }) => label === SPREAD_LABEL);
  if (spread === undefined) {
    throw new Error(`oxlint's ${diagnostic.code} report has no "${SPREAD_LABEL}" label`);
  }
  return {
    messageId: accumulatingSpreadMessageId(kind, filePath),
    check: { reducer: kind.startsWith('reduce'), spreadOffset: spread.span.offset },
  };
}

function nodesAt(sourceFile, position) {
  return chainOf(sourceFile, (node) =>
    ts.forEachChild(node, (child) =>
      child.getStart(sourceFile) <= position && position < child.end ? child : undefined,
    ),
  );
}

function outermostParenthesized(node) {
  return chainOf(node, (current) =>
    ts.isParenthesizedExpression(current.parent) ? current.parent : undefined,
  ).at(-1);
}

function calledMethodName(callee) {
  const expression = ts.skipParentheses(callee);
  if (ts.isPropertyAccessExpression(expression)) {
    return ts.isIdentifier(expression.name) ? expression.name.text : undefined;
  }
  return ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
    ? expression.argumentExpression.text
    : undefined;
}

function calledWith(receiver) {
  const outer = outermostParenthesized(receiver);
  const call = outer.parent.parent;
  return ts.isPropertyAccessExpression(outer.parent) &&
    outer.parent.expression === outer &&
    ts.isCallExpression(call) &&
    call.expression === outer.parent
    ? { method: calledMethodName(outer.parent), call }
    : undefined;
}

function isDirectReducer(fn) {
  const argument = outermostParenthesized(fn);
  const call = argument.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments[0] === argument &&
    call.arguments.length <= 2 &&
    REDUCE_METHODS.has(calledMethodName(call.expression))
  );
}

function isNumber(node) {
  const literal =
    node !== undefined &&
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
      ? node.operand
      : node;
  return literal !== undefined && ts.isNumericLiteral(literal);
}

function isBoundingSlice(array) {
  const called = calledWith(array);
  if (called?.method !== 'slice') {
    return false;
  }
  const [start, end] = called.call.arguments;
  return called.call.arguments.length === 2
    ? isNumber(start) && isNumber(end)
    : called.call.arguments.length === 1 && ts.isPrefixUnaryExpression(start) && isNumber(start);
}

function isFixedShape(spread) {
  const container = spread.parent;
  if (ts.isObjectLiteralExpression(container)) {
    return container.properties.every(
      (property) =>
        property === spread ||
        (!ts.isSpreadAssignment(property) && !ts.isComputedPropertyName(property.name)),
    );
  }
  return ts.isArrayLiteralExpression(container) && isBoundingSlice(container);
}

export function accumulatingSpreadCheck(filePath, text) {
  const sourceFile = ts.createSourceFile(
    filePath,
    text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  return ({ reducer, spread: { line, column } }) => {
    const position = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
    const node = nodesAt(sourceFile, position)
      .filter((candidate) => SPREAD_KINDS.has(candidate.kind))
      .find((candidate) => candidate.getStart(sourceFile) === position);
    if (node === undefined || isFixedShape(node)) {
      return false;
    }
    const fn = chainOf(node.parent, (current) => current.parent).find((current) =>
      FUNCTION_KINDS.has(current.kind),
    );
    return !reducer || (fn !== undefined && isDirectReducer(fn));
  };
}
