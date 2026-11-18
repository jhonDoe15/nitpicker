import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';

export type Step = { readonly via: string };

const CYCLIC_PROPERTIES = new Set([
  'cause',
  'causes',
  'parents',
  'references',
  'dependencies',
  'dependents',
  'deps',
  'importers',
  'imports',
  'edges',
  'links',
  'neighbors',
  'supertypes',
  'bases',
  'baseTypes',
]);
const TYPE_PROPERTIES = new Set([
  'types',
  'target',
  'constraint',
  'resolvedTypeArguments',
  'base',
  'supertype',
]);
const TYPE_CALLS = new Set(['getTypeArguments', 'getBaseTypes']);
const ITERATORS = new Set(['map', 'filter', 'some', 'every', 'find', 'forEach', 'flatMap']);
const MAX_DEPTH = 4;

export type Scope = {
  readonly checker: TypeScript.TypeChecker;
  readonly param: TypeScript.Symbol;
  readonly isType: boolean;
};

export function unwrap(expression: TypeScript.Expression): TypeScript.Expression {
  let current = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      current = current.expression;
    } else if (
      ts.isBinaryExpression(current) &&
      (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        current.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      current = current.left;
    } else {
      return current;
    }
  }
}

function isParam(expression: TypeScript.Expression, scope: Scope): boolean {
  const inner = unwrap(expression);
  return ts.isIdentifier(inner) && scope.checker.getSymbolAtLocation(inner) === scope.param;
}

function chainStep(expression: TypeScript.Expression, scope: Scope): Step | undefined {
  const names: string[] = [];
  let current = unwrap(expression);
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
    }
    current = unwrap(current.expression);
  }
  const known = names.some(
    (name) => CYCLIC_PROPERTIES.has(name) || (scope.isType && TYPE_PROPERTIES.has(name)),
  );
  return ts.isIdentifier(current) &&
    scope.checker.getSymbolAtLocation(current) === scope.param &&
    names.length > 0 &&
    known
    ? { via: `${current.text}.${names.join('.')}` }
    : undefined;
}

function callbackReceiver(declaration: TypeScript.Declaration): TypeScript.Expression | undefined {
  const fn = ts.isParameter(declaration) ? declaration.parent : undefined;
  const call =
    fn !== undefined && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
      ? fn.parent
      : undefined;
  return call !== undefined &&
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    ITERATORS.has(call.expression.name.text) &&
    call.arguments[0] === declaration.parent
    ? call.expression.expression
    : undefined;
}

function viaVariable(declaration: TypeScript.VariableDeclaration, scope: Scope, depth: number) {
  const loop = declaration.parent.parent;
  const source = ts.isForOfStatement(loop) ? loop.expression : declaration.initializer;
  return source === undefined ? undefined : stepOf(source, scope, depth + 1);
}

function viaBinding(declaration: TypeScript.BindingElement, scope: Scope): Step | undefined {
  const name = declaration.propertyName ?? declaration.name;
  const owner = declaration.parent.parent;
  const text = ts.isIdentifier(name) ? name.text : undefined;
  const known = text !== undefined && CYCLIC_PROPERTIES.has(text);
  const fromParam =
    ts.isVariableDeclaration(owner) &&
    owner.initializer !== undefined &&
    isParam(owner.initializer, scope);
  return known && fromParam ? { via: String(text) } : undefined;
}

function viaDeclaration(
  declaration: TypeScript.Declaration | undefined,
  scope: Scope,
  depth: number,
): Step | undefined {
  if (declaration === undefined || depth > MAX_DEPTH) {
    return undefined;
  }
  if (ts.isVariableDeclaration(declaration)) {
    return viaVariable(declaration, scope, depth);
  }
  if (ts.isParameter(declaration)) {
    const receiver = callbackReceiver(declaration);
    return receiver === undefined ? undefined : stepOf(receiver, scope, depth + 1);
  }
  return ts.isBindingElement(declaration) ? viaBinding(declaration, scope) : undefined;
}

export function stepOf(
  expression: TypeScript.Expression,
  scope: Scope,
  depth = 0,
): Step | undefined {
  const inner = unwrap(expression);
  if (ts.isCallExpression(inner)) {
    const name = ts.isPropertyAccessExpression(inner.expression)
      ? inner.expression.name.text
      : undefined;
    const [first] = inner.arguments;
    return scope.isType &&
      name !== undefined &&
      TYPE_CALLS.has(name) &&
      first !== undefined &&
      isParam(first, scope)
      ? { via: `${name}(${scope.param.name})` }
      : undefined;
  }
  if (ts.isIdentifier(inner)) {
    const symbol = scope.checker.getSymbolAtLocation(inner);
    return viaDeclaration(symbol?.valueDeclaration, scope, depth);
  }
  return chainStep(inner, scope);
}
