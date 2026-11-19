import type TypeScript from 'typescript';
import { parentOf, ts, withoutParentheses } from '../typed/typescript-views.mts';
import { isHelperName } from '../queries/soft-delete/columns.mts';
import { assignsFlag, flagOf, mentionsFlag, type Flag } from './flags.mts';
import {
  expressionIncludesDeleted,
  parameterSlot,
  type ParameterSlot,
} from './including-deleted.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

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
  readonly includesDeleted: boolean;
  readonly slot: ParameterSlot | undefined;
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

function callsHelperOn(body: TypeScript.Node, elementNames: readonly string[]): boolean {
  const pending = [body];
  for (const node of pending) {
    const helper = ts.isCallExpression(node) && isHelperReference(node.expression);
    const taken = helper && node.arguments.some((arg) => elementNames.includes(arg.getText()));
    if (taken) {
      return true;
    }
    appendAll(pending, node.getChildren());
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

type Subject = {
  readonly checker: TypeScript.TypeChecker;
  readonly element: TypeScript.Node;
  readonly parts: Parts;
  readonly elementNames: readonly string[];
};

function describe({ checker, element, parts, elementNames }: Subject): Iteration | undefined {
  const type = checker.getTypeAtLocation(element);
  const flag = flagOf(checker, checker.getNonNullableType(type), element);
  if (flag === undefined) {
    return undefined;
  }
  if (assignsFlag(parts.body, flag.name)) {
    return undefined;
  }
  const guarded =
    flag.narrowed ||
    mentionsFlag(parts.body, flag.name) ||
    callsHelperOn(parts.body, elementNames) ||
    receiverGuards(parts.receiver, flag.name);
  return {
    node: parts.node,
    kind: parts.kind,
    flag,
    guarded,
    type: checker.typeToString(checker.getNonNullableType(type)),
    includesDeleted: expressionIncludesDeleted(checker, parts.receiver),
    slot: parameterSlot(checker, parts.receiver),
  };
}

function nameOf(declaration: TypeScript.ParameterDeclaration | TypeScript.VariableDeclaration) {
  return ts.isIdentifier(declaration.name) ? [declaration.name.text] : [];
}

function isWritten(access: TypeScript.ElementAccessExpression): boolean {
  const parent = parentOf(access);
  return (
    parent !== undefined &&
    ts.isBinaryExpression(parent) &&
    parent.left === access &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

function indexVariable(node: TypeScript.ForStatement): string | undefined {
  const { initializer } = node;
  const [declaration] =
    initializer !== undefined && ts.isVariableDeclarationList(initializer)
      ? initializer.declarations
      : [];
  return declaration !== undefined && ts.isIdentifier(declaration.name)
    ? declaration.name.text
    : undefined;
}

function indexedReads(
  checker: TypeScript.TypeChecker,
  node: TypeScript.ForStatement,
  index: string,
): TypeScript.ElementAccessExpression[] {
  const found: TypeScript.ElementAccessExpression[] = [];
  const pending: TypeScript.Node[] = [node.statement];
  for (const current of pending) {
    if (
      ts.isElementAccessExpression(current) &&
      ts.isIdentifier(current.argumentExpression) &&
      current.argumentExpression.text === index &&
      !isWritten(current) &&
      isArray(checker, checker.getTypeAtLocation(current.expression))
    ) {
      found.push(current);
    }
    appendAll(pending, current.getChildren());
  }
  return found;
}

function elementNamesOf(access: TypeScript.ElementAccessExpression): string[] {
  const parent = parentOf(access);
  const assigned =
    parent !== undefined && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
      ? [parent.name.text]
      : [];
  return [access.getText(), ...assigned];
}

function indexedIteration(
  checker: TypeScript.TypeChecker,
  node: TypeScript.ForStatement,
): Iteration | undefined {
  const index = indexVariable(node);
  const reads = index === undefined ? [] : indexedReads(checker, node, index);
  for (const access of reads) {
    const parts = { node, body: node, receiver: access.expression, kind: 'for' };
    const found = describe({
      checker,
      element: access,
      parts,
      elementNames: elementNamesOf(access),
    });
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
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
  return describe({ checker, element: parameter, parts, elementNames: nameOf(parameter) });
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
  return describe({ checker, element: declaration, parts, elementNames: nameOf(declaration) });
}

function iterationAt(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): Iteration | undefined {
  if (ts.isCallExpression(node)) {
    return callbackIteration(checker, node);
  }
  if (ts.isForStatement(node)) {
    return indexedIteration(checker, node);
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
    appendAll(pending, node.getChildren(sourceFile));
  }
  return found;
}
