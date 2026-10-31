import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../analysis/ancestry.mjs';

const ALIAS_DEPTH = 5;
const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

function innerOf(expression) {
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

export function unwrapExpression(expression) {
  return chainOf(expression, innerOf).at(-1);
}

function isFunctionLiteral(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node);
}

function functionLiteralOf(expression) {
  const pending = [expression];
  for (const candidate of pending) {
    const inner = unwrapExpression(candidate);
    if (isFunctionLiteral(inner)) {
      return inner;
    }
    pending.push(...(ts.isCallExpression(inner) ? inner.arguments : []));
  }
  return undefined;
}

function functionOf(declaration) {
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

function isReferenceExpression(node) {
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node);
}

function nameOf(node) {
  return ts.isIdentifier(node) ? node : node.name;
}

function isCallbackPosition(node) {
  const { parent } = node;
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    return parent.arguments?.includes(node) === true;
  }
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    FUNCTION_METHODS.has(parent.name.text)
  );
}

export function referenceOf(node) {
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

export function referenceName(target) {
  return nameOf(target).text;
}

function declarationsOf(checker, symbol) {
  const resolved =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return resolved?.declarations ?? [];
}

function aliasedSymbolOf(checker, declaration) {
  const initializer = ts.isVariableDeclaration(declaration)
    ? declaration.initializer && unwrapExpression(declaration.initializer)
    : undefined;
  return initializer !== undefined && isReferenceExpression(initializer)
    ? checker.getSymbolAtLocation(nameOf(initializer))
    : undefined;
}

function aliasedDeclarations(checker, symbol) {
  const found = [];
  const pending = [{ symbol, depth: ALIAS_DEPTH }];
  for (const { symbol: current, depth } of pending) {
    const declarations = declarationsOf(checker, current);
    found.push(...declarations);
    const next =
      depth === 0 ? [] : declarations.map((declaration) => aliasedSymbolOf(checker, declaration));
    pending.push(...next.filter(Boolean).map((alias) => ({ symbol: alias, depth: depth - 1 })));
  }
  return found;
}

export function functionsOf(checker, target, mode) {
  return functionsOfSymbol(checker, checker.getSymbolAtLocation(nameOf(target)), mode);
}

export function functionsOfSymbol(checker, symbol, mode) {
  return aliasedDeclarations(checker, symbol)
    .filter((declaration) => mode !== 'access' || ts.isGetAccessorDeclaration(declaration))
    .map(functionOf)
    .filter((fn) => fn !== undefined);
}

function constructorParts(klass) {
  return klass.members.flatMap((member) => {
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

export function bodyParts(fn) {
  if (ts.isClassDeclaration(fn) || ts.isClassExpression(fn)) {
    return constructorParts(fn);
  }
  return [...fn.parameters, fn.body];
}
