import ts from 'typescript';

const NESTED_BOUNDARY_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
]);

const SHORT_CIRCUIT_KINDS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

export function isNestedBoundary(node) {
  return NESTED_BOUNDARY_KINDS.has(node.kind);
}

export function childrenOf(node) {
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

export function nodesOwnedBy(root) {
  const owned = [];
  const pending = [root];
  for (const node of pending) {
    owned.push(node);
    pending.push(...childrenOf(node).filter((child) => !isNestedBoundary(child)));
  }
  return owned;
}

export function hasOwnOptionalChainToken(node) {
  return (
    (ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node) || ts.isCallChain(node)) &&
    node.questionDotToken !== undefined
  );
}

export function isShortCircuit(node) {
  return ts.isBinaryExpression(node) && SHORT_CIRCUIT_KINDS.has(node.operatorToken.kind);
}
