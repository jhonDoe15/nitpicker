import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import {
  hasOwnOptionalChainToken,
  isNestedBoundary,
  isShortCircuit,
  nodesOwnedBy,
} from './own-nodes.mts';

const ts = typescriptApi();

const INCREMENT_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause,
]);

const BRANCH_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.SwitchStatement,
]);

function contribution(node: TypeScript.Node): number {
  return INCREMENT_KINDS.has(node.kind) || hasOwnOptionalChainToken(node) || isShortCircuit(node)
    ? 1
    : 0;
}

export function cyclomaticComplexity(functionNode: { readonly body: TypeScript.Node }): number {
  const owned = isNestedBoundary(functionNode.body) ? [] : nodesOwnedBy(functionNode.body);
  return owned.reduce((total, node) => total + contribution(node), 1);
}

export function expectsStatementCoverage(body: TypeScript.Node): boolean {
  return (
    !ts.isBlock(body) ||
    body.statements.some(
      (statement) =>
        !(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)),
    )
  );
}

function hasBranchSyntax(node: TypeScript.Node): boolean {
  return BRANCH_KINDS.has(node.kind) || hasOwnOptionalChainToken(node) || isShortCircuit(node);
}

export function expectsBranchCoverage(body: TypeScript.Node): boolean {
  return nodesOwnedBy(body).some(hasBranchSyntax);
}
