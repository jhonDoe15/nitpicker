import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';

const ts = typescriptApi();

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

export function isNestedBoundary(node: TypeScript.Node): boolean {
  return NESTED_BOUNDARY_KINDS.has(node.kind);
}

export function childrenOf(node: TypeScript.Node): TypeScript.Node[] {
  const children: TypeScript.Node[] = [];
  ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

export function nodesOwnedBy(root: TypeScript.Node): TypeScript.Node[] {
  const owned: TypeScript.Node[] = [];
  const pending = [root];
  for (const node of pending) {
    owned.push(node);
    for (const child of childrenOf(node).filter((candidate) => !isNestedBoundary(candidate))) {
      pending.push(child);
    }
  }
  return owned;
}

export function hasOwnOptionalChainToken(node: TypeScript.Node): boolean {
  return (
    (ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node) || ts.isCallChain(node)) &&
    node.questionDotToken !== undefined
  );
}

export function isShortCircuit(node: TypeScript.Node): boolean {
  return ts.isBinaryExpression(node) && SHORT_CIRCUIT_KINDS.has(node.operatorToken.kind);
}
