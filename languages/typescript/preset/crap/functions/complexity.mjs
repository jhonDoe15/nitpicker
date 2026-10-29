import { ts } from '../../../typescript-api/typescript-api.mjs';
import {
  hasOwnOptionalChainToken,
  isNestedBoundary,
  isShortCircuit,
  nodesOwnedBy,
} from './own-nodes.mjs';

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

function contribution(node) {
  return INCREMENT_KINDS.has(node.kind) || hasOwnOptionalChainToken(node) || isShortCircuit(node)
    ? 1
    : 0;
}

export function cyclomaticComplexity(functionNode) {
  const owned = isNestedBoundary(functionNode.body) ? [] : nodesOwnedBy(functionNode.body);
  return owned.reduce((total, node) => total + contribution(node), 1);
}

export function expectsStatementCoverage(body) {
  return ts.isBlock(body)
    ? body.statements.some(
        (statement) =>
          !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement),
      )
    : true;
}

function hasBranchSyntax(node) {
  return BRANCH_KINDS.has(node.kind) || hasOwnOptionalChainToken(node) || isShortCircuit(node);
}

export function expectsBranchCoverage(body) {
  return nodesOwnedBy(body).some(hasBranchSyntax);
}
