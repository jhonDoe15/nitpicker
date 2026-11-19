import type TypeScript from 'typescript';
import { ts, wrappedExpression } from '../typed/typescript-views.mts';

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

function fallbackLeft(expression: TypeScript.Expression): TypeScript.Expression | undefined {
  return ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ? expression.left
    : undefined;
}

export function unwrap(expression: TypeScript.Expression): TypeScript.Expression {
  const chain = [expression];
  for (const current of chain) {
    const inner = wrappedExpression(current) ?? fallbackLeft(current);
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  return chain.at(-1) ?? expression;
}

function isParam(expression: TypeScript.Expression, scope: Scope): boolean {
  const inner = unwrap(expression);
  return ts.isIdentifier(inner) && scope.checker.getSymbolAtLocation(inner) === scope.param;
}

function chainStep(expression: TypeScript.Expression, scope: Scope): Step | undefined {
  const names: string[] = [];
  const pending = [unwrap(expression)];
  for (const current of pending) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      pending.push(unwrap(current.expression));
    }
  }
  const root = pending.at(-1);
  const known = names.some(
    (name) => CYCLIC_PROPERTIES.has(name) || (scope.isType && TYPE_PROPERTIES.has(name)),
  );
  return root !== undefined &&
    ts.isIdentifier(root) &&
    scope.checker.getSymbolAtLocation(root) === scope.param &&
    names.length > 0 &&
    known
    ? { via: `${root.text}.${names.join('.')}` }
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

function viaBinding(declaration: TypeScript.BindingElement, scope: Scope): Step | undefined {
  const name = declaration.propertyName ?? declaration.name;
  const owner = declaration.parent.parent;
  const text = ts.isIdentifier(name) ? name.text : undefined;
  const known = text !== undefined && CYCLIC_PROPERTIES.has(text);
  const fromParam =
    ts.isVariableDeclaration(owner) &&
    owner.initializer !== undefined &&
    isParam(owner.initializer, scope);
  return known && fromParam ? { via: text } : undefined;
}

type Advance = Step | TypeScript.Expression | undefined;

function advanceDeclaration(declaration: TypeScript.Declaration, scope: Scope): Advance {
  if (ts.isVariableDeclaration(declaration)) {
    const loop = declaration.parent.parent;
    return ts.isForOfStatement(loop) ? loop.expression : declaration.initializer;
  }
  if (ts.isParameter(declaration)) {
    return callbackReceiver(declaration);
  }
  return ts.isBindingElement(declaration) ? viaBinding(declaration, scope) : undefined;
}

function advanceCall(call: TypeScript.CallExpression, scope: Scope): Step | undefined {
  const name = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : undefined;
  const [first] = call.arguments;
  return scope.isType &&
    name !== undefined &&
    TYPE_CALLS.has(name) &&
    first !== undefined &&
    isParam(first, scope)
    ? { via: `${name}(${scope.param.name})` }
    : undefined;
}

function advance(expression: TypeScript.Expression, scope: Scope, depth: number): Advance {
  const inner = unwrap(expression);
  if (ts.isCallExpression(inner)) {
    return advanceCall(inner, scope);
  }
  if (ts.isIdentifier(inner)) {
    const declaration = scope.checker.getSymbolAtLocation(inner)?.valueDeclaration;
    return declaration === undefined || depth > MAX_DEPTH
      ? undefined
      : advanceDeclaration(declaration, scope);
  }
  return chainStep(inner, scope);
}

export function stepOf(expression: TypeScript.Expression, scope: Scope): Step | undefined {
  const pending = [{ expression, depth: 0 }];
  for (const hop of pending) {
    const result = advance(hop.expression, scope, hop.depth);
    if (result === undefined || 'via' in result) {
      return result;
    }
    pending.push({ expression: result, depth: hop.depth + 1 });
  }
  return undefined;
}
