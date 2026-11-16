import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { isHelperName } from '../queries/soft-delete/columns.mts';
import { assignsFlag, flagOf, mentionsFlag } from './flags.mts';

const CALLBACK_METHODS = new Set([
  'map',
  'filter',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'forEach',
  'flatMap',
]);

const CALLBACK_KINDS = [ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionExpression];

function isCallbackFunction(node) {
  return node !== undefined && CALLBACK_KINDS.includes(node.kind);
}

function unparenthesized(node) {
  const pending = [node];
  for (const current of pending) {
    if (ts.isParenthesizedExpression(current)) {
      pending.push(current.expression);
    }
  }
  return pending.at(-1);
}

function isHelperReference(node) {
  const name = ts.isPropertyAccessExpression(node) ? node.name.text : node.text;
  return (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) && isHelperName(name);
}

function callsHelperOn(body, elementName) {
  const pending = [body];
  for (const node of pending) {
    const helper = ts.isCallExpression(node) && isHelperReference(node.expression);
    const taken =
      helper && node.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === elementName);
    if (taken) {
      return true;
    }
    pending.push(...node.getChildren());
  }
  return false;
}

function callGuards(call, name) {
  const { expression } = call;
  const method = ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
  const callback = call.arguments.find(isCallbackFunction);
  const named = method ?? (ts.isIdentifier(expression) ? expression.text : undefined);
  return (
    (callback !== undefined && mentionsFlag(callback.body, name)) ||
    (named !== undefined && isHelperName(named)) ||
    call.arguments.some(isHelperReference)
  );
}

function receiverGuards(receiver, name) {
  const pending = [unparenthesized(receiver)];
  for (const current of pending) {
    if (!ts.isCallExpression(current)) {
      continue;
    }
    if (callGuards(current, name)) {
      return true;
    }
    const { expression } = current;
    if (ts.isPropertyAccessExpression(expression)) {
      pending.push(unparenthesized(expression.expression));
    }
  }
  return false;
}

function isArray(checker, type) {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

function describe(checker, element, parts) {
  const type = checker.getTypeAtLocation(element);
  const flag = flagOf(checker, checker.getNonNullableType(type), element);
  if (flag === undefined) {
    return undefined;
  }
  if (assignsFlag(parts.body, flag.name)) {
    return undefined;
  }
  const elementName = ts.isIdentifier(element.name) ? element.name.text : undefined;
  const guarded =
    flag.narrowed ||
    mentionsFlag(parts.body, flag.name) ||
    callsHelperOn(parts.body, elementName) ||
    receiverGuards(parts.receiver, flag.name);
  return {
    node: parts.node,
    kind: parts.kind,
    flag,
    guarded,
    type: checker.typeToString(checker.getNonNullableType(type)),
  };
}

function callbackIteration(checker, node) {
  const { expression } = node;
  const callback = node.arguments[0];
  const isCandidate =
    ts.isPropertyAccessExpression(expression) &&
    CALLBACK_METHODS.has(expression.name.text) &&
    isCallbackFunction(callback) &&
    callback.parameters.length > 0 &&
    isArray(checker, checker.getTypeAtLocation(expression.expression));
  if (!isCandidate) {
    return undefined;
  }
  const parts = {
    node,
    body: callback.body,
    receiver: expression.expression,
    kind: expression.name.text,
  };
  return describe(checker, callback.parameters[0], parts);
}

function loopIteration(checker, node) {
  const declaration = ts.isVariableDeclarationList(node.initializer)
    ? node.initializer.declarations[0]
    : undefined;
  const isCandidate = declaration !== undefined && ts.isIdentifier(declaration.name);
  const parts = { node, body: node.statement, receiver: node.expression, kind: 'for...of' };
  return isCandidate ? describe(checker, declaration, parts) : undefined;
}

function iterationAt(checker, node) {
  if (ts.isCallExpression(node)) {
    return callbackIteration(checker, node);
  }
  return ts.isForOfStatement(node) ? loopIteration(checker, node) : undefined;
}

export function iterationsIn(sourceFile, checker) {
  const found = [];
  const pending = [sourceFile];
  for (const node of pending) {
    const iteration = iterationAt(checker, node);
    if (iteration !== undefined) {
      found.push(iteration);
    }
    pending.push(...node.getChildren(sourceFile));
  }
  return found;
}
