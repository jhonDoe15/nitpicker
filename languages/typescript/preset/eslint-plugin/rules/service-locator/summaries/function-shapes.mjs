import ts from 'typescript';

const ALIAS_DEPTH = 5;
const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

export function unwrapExpression(expression) {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.CommaToken
    ? unwrapExpression(expression.right)
    : expression;
}

function functionLiteralOf(expression) {
  const inner = unwrapExpression(expression);
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner) || ts.isClassExpression(inner)) {
    return inner;
  }
  if (ts.isCallExpression(inner)) {
    return inner.arguments.map(functionLiteralOf).find((found) => found !== undefined);
  }
  return undefined;
}

export function functionOf(declaration) {
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

export function isCallbackPosition(node) {
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

function aliasedDeclarations(checker, symbol, depth) {
  const resolved =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const declarations = resolved?.declarations ?? [];
  if (depth === 0) {
    return declarations;
  }
  return declarations.flatMap((declaration) => {
    const initializer = ts.isVariableDeclaration(declaration)
      ? declaration.initializer && unwrapExpression(declaration.initializer)
      : undefined;
    if (initializer === undefined || !isReferenceExpression(initializer)) {
      return [declaration];
    }
    const next = checker.getSymbolAtLocation(nameOf(initializer));
    return [declaration, ...aliasedDeclarations(checker, next, depth - 1)];
  });
}

export function functionsOf(checker, target, mode) {
  return functionsOfSymbol(checker, checker.getSymbolAtLocation(nameOf(target)), mode);
}

export function functionsOfSymbol(checker, symbol, mode) {
  return aliasedDeclarations(checker, symbol, ALIAS_DEPTH)
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
