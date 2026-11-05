import { ts } from '../../../../typescript-api/typescript-api.mjs';

function partsOf(type) {
  return type.isUnion() ? type.types : [type];
}

export function isThenable(checker, node) {
  return partsOf(checker.getTypeAtLocation(node)).some((part) => {
    const then = checker.getApparentType(part).getProperty('then');
    return (
      then !== undefined &&
      checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > 0
    );
  });
}

function isAsync(fn) {
  return (fn.modifiers ?? []).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
}

function functionOf(declaration) {
  const initialized =
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration);
  const fn = initialized ? declaration.initializer : declaration;
  return fn !== undefined && ts.isFunctionLike(fn) ? fn : undefined;
}

function isBoundary(node) {
  return ts.isFunctionLike(node) || ts.isClassLike(node);
}

function returnsPromise(checker, node) {
  return (
    ts.isReturnStatement(node) &&
    node.expression !== undefined &&
    !ts.isAwaitExpression(ts.skipOuterExpressions(node.expression)) &&
    isThenable(checker, node.expression)
  );
}

function raises(checker, node) {
  return (
    ts.isThrowStatement(node) ||
    ts.isAwaitExpression(node) ||
    (ts.isForOfStatement(node) && node.awaitModifier !== undefined) ||
    returnsPromise(checker, node)
  );
}

function guardedParts(node) {
  return [node.catchClause.block, node.finallyBlock].filter((part) => part !== undefined);
}

function anyInside(root, matches, guards) {
  const pending = [root];
  for (const node of pending) {
    if (matches(node)) {
      return true;
    }
    if (guards && ts.isTryStatement(node) && node.catchClause !== undefined) {
      pending.push(...guardedParts(node));
    } else if (node === root || !isBoundary(node)) {
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
  }
  return false;
}

function isCatchingStatement(checker, statement) {
  return (
    ts.isTryStatement(statement) &&
    statement.catchClause !== undefined &&
    !anyInside(statement.tryBlock, (node) => returnsPromise(checker, node), false) &&
    !guardedParts(statement).some((part) =>
      anyInside(part, (node) => raises(checker, node), true),
    )
  );
}

function isCatchingFunction(checker, fn) {
  return (
    isAsync(fn) &&
    fn.body !== undefined &&
    ts.isBlock(fn.body) &&
    fn.body.statements.length > 0 &&
    fn.body.statements.every((statement) => isCatchingStatement(checker, statement))
  );
}

function calleeDeclarations(checker, callee) {
  const named = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  const symbol = checker.getSymbolAtLocation(named);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return target?.declarations ?? [];
}

export function calleeCannotReject(checker, callee) {
  const inner = ts.skipOuterExpressions(callee);
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) {
    return isCatchingFunction(checker, inner);
  }
  const implementations = calleeDeclarations(checker, inner)
    .map(functionOf)
    .filter((fn) => fn?.body !== undefined);
  return (
    implementations.length > 0 && implementations.every((fn) => isCatchingFunction(checker, fn))
  );
}
