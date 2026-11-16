import type TypeScript from 'typescript';
import { ts, withoutParentheses } from '../typed/typescript-views.mts';
import { isHelperName } from '../queries/soft-delete/columns.mts';
import { assignsFlag, flagOf, mentionsFlag, type Flag } from './flags.mts';

type Callback = TypeScript.ArrowFunction | TypeScript.FunctionExpression;
type Parts = {
  readonly node: TypeScript.Node;
  readonly body: TypeScript.Node;
  readonly receiver: TypeScript.Expression;
  readonly kind: string;
};
export type Iteration = {
  readonly node: TypeScript.Node;
  readonly kind: string;
  readonly flag: Flag;
  readonly guarded: boolean;
  readonly type: string;
};

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

function isCallbackFunction(node: TypeScript.Node | undefined): node is Callback {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function isHelperReference(node: TypeScript.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return isHelperName(node.name.text);
  }
  return ts.isIdentifier(node) && isHelperName(node.text);
}

function callsHelperOn(body: TypeScript.Node, elementName: string | undefined): boolean {
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

function callGuards(call: TypeScript.CallExpression, name: string): boolean {
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

function receiverGuards(receiver: TypeScript.Expression, name: string): boolean {
  const pending = [withoutParentheses(receiver)];
  for (const current of pending) {
    if (!ts.isCallExpression(current)) {
      continue;
    }
    if (callGuards(current, name)) {
      return true;
    }
    const { expression } = current;
    if (ts.isPropertyAccessExpression(expression)) {
      pending.push(withoutParentheses(expression.expression));
    }
  }
  return false;
}

function isArray(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

function describe(
  checker: TypeScript.TypeChecker,
  element: TypeScript.ParameterDeclaration | TypeScript.VariableDeclaration,
  parts: Parts,
): Iteration | undefined {
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

function callbackIteration(
  checker: TypeScript.TypeChecker,
  node: TypeScript.CallExpression,
): Iteration | undefined {
  const { expression } = node;
  const callback = node.arguments[0];
  const [parameter] = isCallbackFunction(callback) ? callback.parameters : [];
  if (
    !ts.isPropertyAccessExpression(expression) ||
    !CALLBACK_METHODS.has(expression.name.text) ||
    !isCallbackFunction(callback) ||
    parameter === undefined ||
    !isArray(checker, checker.getTypeAtLocation(expression.expression))
  ) {
    return undefined;
  }
  const parts = {
    node,
    body: callback.body,
    receiver: expression.expression,
    kind: expression.name.text,
  };
  return describe(checker, parameter, parts);
}

function loopIteration(
  checker: TypeScript.TypeChecker,
  node: TypeScript.ForOfStatement,
): Iteration | undefined {
  const declaration = ts.isVariableDeclarationList(node.initializer)
    ? node.initializer.declarations[0]
    : undefined;
  if (declaration === undefined || !ts.isIdentifier(declaration.name)) {
    return undefined;
  }
  const parts = { node, body: node.statement, receiver: node.expression, kind: 'for...of' };
  return describe(checker, declaration, parts);
}

function iterationAt(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): Iteration | undefined {
  if (ts.isCallExpression(node)) {
    return callbackIteration(checker, node);
  }
  return ts.isForOfStatement(node) ? loopIteration(checker, node) : undefined;
}

export function iterationsIn(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
): Iteration[] {
  const found: Iteration[] = [];
  const pending: TypeScript.Node[] = [sourceFile];
  for (const node of pending) {
    const iteration = iterationAt(checker, node);
    if (iteration !== undefined) {
      found.push(iteration);
    }
    pending.push(...node.getChildren(sourceFile));
  }
  return found;
}
