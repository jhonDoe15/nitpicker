import type TypeScript from 'typescript';
import { syntaxChildren as untypedSyntaxChildren } from '../../../../syntax/children.mjs';
import { chainOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

export type ResolvedFunction =
  | TypeScript.FunctionDeclaration
  | TypeScript.MethodDeclaration
  | TypeScript.GetAccessorDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.ArrowFunction
  | TypeScript.FunctionExpression
  | TypeScript.ClassExpression;
export type ReferenceMode = 'call' | 'reference' | 'access';
type ReferenceExpression = TypeScript.Identifier | TypeScript.PropertyAccessExpression;
type FunctionLiteral =
  TypeScript.ArrowFunction | TypeScript.FunctionExpression | TypeScript.ClassExpression;
type AliasSearch = { readonly symbol: TypeScript.Symbol | undefined; readonly depth: number };

export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;

const ALIAS_DEPTH = 5;
const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

export function parentNode(node: TypeScript.Node): TypeScript.Node | undefined {
  return node.parent;
}

export function includesNode(
  list: readonly TypeScript.Node[] | undefined,
  node: TypeScript.Node,
): boolean {
  return list?.includes(node) === true;
}

function innerOf(expression: TypeScript.Node): TypeScript.Node | undefined {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return expression.expression;
  }
  return ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.CommaToken
    ? expression.right
    : undefined;
}

export function unwrapExpression(expression: TypeScript.Node): TypeScript.Node {
  return chainOf<TypeScript.Node>(expression, innerOf).at(-1) ?? expression;
}

function isFunctionLiteral(node: TypeScript.Node): node is FunctionLiteral {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node);
}

function functionLiteralOf(expression: TypeScript.Node): FunctionLiteral | undefined {
  const pending = [expression];
  for (const candidate of pending) {
    const inner = unwrapExpression(candidate);
    if (isFunctionLiteral(inner)) {
      return inner;
    }
    appendAll(pending, ts.isCallExpression(inner) ? inner.arguments : []);
  }
  return undefined;
}

function functionOf(declaration: TypeScript.Declaration): ResolvedFunction | undefined {
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isMethodDeclaration(declaration) ||
    ts.isGetAccessorDeclaration(declaration)
  ) {
    return declaration.body === undefined ? undefined : declaration;
  }
  if (ts.isClassDeclaration(declaration)) {
    return declaration;
  }
  if (
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration) ||
    ts.isPropertyDeclaration(declaration)
  ) {
    return declaration.initializer === undefined
      ? undefined
      : functionLiteralOf(declaration.initializer);
  }
  return ts.isExportAssignment(declaration) ? functionLiteralOf(declaration.expression) : undefined;
}

function isReferenceExpression(node: TypeScript.Node): node is ReferenceExpression {
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node);
}

function nameOf(node: ReferenceExpression): TypeScript.Identifier | TypeScript.MemberName {
  return ts.isIdentifier(node) ? node : node.name;
}

function isCallbackPosition(node: TypeScript.Node): boolean {
  const { parent } = node;
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    return includesNode(parent.arguments, node);
  }
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    FUNCTION_METHODS.has(parent.name.text)
  );
}

export function referenceOf(
  node: TypeScript.Node,
): { readonly target: ReferenceExpression; readonly mode: ReferenceMode } | undefined {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const target = unwrapExpression(node.expression);
    return isReferenceExpression(target) ? { target, mode: 'call' } : undefined;
  }
  if (!isReferenceExpression(node)) {
    return undefined;
  }
  if (isCallbackPosition(node)) {
    return { target: node, mode: 'reference' };
  }
  const { parent } = node;
  const callee =
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
  return ts.isPropertyAccessExpression(node) && !callee
    ? { target: node, mode: 'access' }
    : undefined;
}

export function referenceName(target: ReferenceExpression): string {
  return nameOf(target).text;
}

function declarationsOf(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): readonly TypeScript.Declaration[] {
  const resolved =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return resolved?.declarations ?? [];
}

function aliasedSymbolOf(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.Declaration,
): TypeScript.Symbol | undefined {
  const initializer =
    ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined
      ? unwrapExpression(declaration.initializer)
      : undefined;
  return initializer !== undefined && isReferenceExpression(initializer)
    ? checker.getSymbolAtLocation(nameOf(initializer))
    : undefined;
}

function aliasedDeclarations(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): TypeScript.Declaration[] {
  const found: TypeScript.Declaration[] = [];
  const pending: AliasSearch[] = [{ symbol, depth: ALIAS_DEPTH }];
  for (const { symbol: current, depth } of pending) {
    const declarations = declarationsOf(checker, current);
    appendAll(found, declarations);
    const next =
      depth === 0 ? [] : declarations.map((declaration) => aliasedSymbolOf(checker, declaration));
    appendAll(
      pending,
      next.flatMap((alias) => (alias === undefined ? [] : [{ symbol: alias, depth: depth - 1 }])),
    );
  }
  return found;
}

export function functionsOf(
  checker: TypeScript.TypeChecker,
  target: ReferenceExpression,
  mode: ReferenceMode,
): ResolvedFunction[] {
  return functionsOfSymbol(checker, checker.getSymbolAtLocation(nameOf(target)), mode);
}

export function functionsOfSymbol(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
  mode: ReferenceMode,
): ResolvedFunction[] {
  return aliasedDeclarations(checker, symbol)
    .filter((declaration) => mode !== 'access' || ts.isGetAccessorDeclaration(declaration))
    .map(functionOf)
    .filter((fn) => fn !== undefined);
}

function constructorParts(
  klass: TypeScript.ClassDeclaration | TypeScript.ClassExpression,
): TypeScript.Node[] {
  return klass.members.flatMap((member): TypeScript.Node[] => {
    if (ts.isConstructorDeclaration(member)) {
      return [...member.parameters, ...(member.body === undefined ? [] : [member.body])];
    }
    const isInstanceField =
      ts.isPropertyDeclaration(member) &&
      member.initializer !== undefined &&
      (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) === 0 &&
      functionLiteralOf(member.initializer) === undefined;
    return isInstanceField ? [member.initializer] : [];
  });
}

export function bodyParts(fn: ResolvedFunction): TypeScript.Node[] {
  if (ts.isClassDeclaration(fn) || ts.isClassExpression(fn)) {
    return constructorParts(fn);
  }
  return [...fn.parameters, ...(fn.body === undefined ? [] : [fn.body])];
}
