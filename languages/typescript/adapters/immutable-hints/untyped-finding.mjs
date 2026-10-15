import ts from 'typescript';
import { KINDS, TYPE_NAME_KINDS } from './kinds.mjs';

const ARRAY_PRODUCING_METHODS = new Set([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);

const ARRAY_PRODUCING_STATICS = new Set([
  'Array.from',
  'Array.of',
  'Object.entries',
  'Object.keys',
  'Object.values',
]);

function unwrapExpression(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function kindOfExpression(expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return 'array';
  }
  if (ts.isRegularExpressionLiteral(unwrapped)) {
    return 'regexp';
  }
  if (ts.isNewExpression(unwrapped)) {
    return TYPE_NAME_KINDS.get(unwrapped.expression.getText());
  }
  return ts.isCallExpression(unwrapped) ? kindOfCall(unwrapped) : undefined;
}

function kindOfCall(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const method = callee.name.text;
  const callText = `${callee.expression.getText()}.${method}`;
  if (callText === 'Map.groupBy') {
    return 'map';
  }
  if (callText === 'Object.groupBy') {
    return 'groupBy';
  }
  if (method === 'exec' || method === 'match') {
    return 'execArray';
  }
  if (ARRAY_PRODUCING_STATICS.has(callText) || ARRAY_PRODUCING_METHODS.has(method)) {
    return 'array';
  }
  return rootIdentifier(callee) === 'z' ? 'schema' : undefined;
}

function rootIdentifier(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      chain.push(current.expression);
    }
  }
  const root = chain.at(-1);
  return ts.isIdentifier(root) ? root.text : undefined;
}

function returnedExpression(fn) {
  if (fn.body === undefined || !ts.isBlock(fn.body)) {
    return fn.body;
  }
  const last = fn.body.statements.at(-1);
  return last !== undefined && ts.isReturnStatement(last) ? last.expression : undefined;
}

function isCallbackArgument(fn) {
  return (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    ts.isCallExpression(fn.parent) &&
    fn.parent.arguments.includes(fn)
  );
}

function expressionKind(expression) {
  if (expression === undefined) {
    return undefined;
  }
  if (ts.isObjectLiteralExpression(unwrapExpression(expression))) {
    return 'object';
  }
  return kindOfExpression(expression);
}

function untypedKind(declaration) {
  if (ts.isFunctionLike(declaration)) {
    return isCallbackArgument(declaration)
      ? 'callback'
      : expressionKind(returnedExpression(declaration));
  }
  if (ts.isBindingElement(declaration) && declaration.dotDotDotToken !== undefined) {
    return 'rest';
  }
  const initialized =
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isParameter(declaration);
  return initialized ? expressionKind(declaration.initializer) : undefined;
}

export function untypedFinding(declaration) {
  const kind = untypedKind(declaration);
  return kind === undefined ? undefined : { kind, label: KINDS[kind].label };
}

export function typeParameterFinding(declaration, sourceFile) {
  const name = declaration.type?.typeName?.getText(sourceFile);
  const owner = declaration.parent;
  const declared = ts.isFunctionLike(owner) ? (owner.typeParameters ?? []) : [];
  return ts.isParameter(declaration) && declared.some((parameter) => parameter.name.text === name)
    ? { kind: 'typeParameter', label: KINDS.typeParameter.label }
    : undefined;
}
