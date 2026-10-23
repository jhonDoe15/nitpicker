import ts from 'typescript';
import { chainOf, depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';

const WRAPPERS = [
  ts.isParenthesizedExpression,
  ts.isNonNullExpression,
  ts.isAsExpression,
  ts.isSatisfiesExpression,
  ts.isTypeAssertionExpression,
];

const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
]);

export function isWrapper(node) {
  return WRAPPERS.some((test) => test(node));
}

export function unwrap(node) {
  return chainOf(node, (current) => (isWrapper(current) ? current.expression : undefined)).at(-1);
}

export function isValueWrapper(parent, child) {
  return (isWrapper(parent) || ts.isAwaitExpression(parent)) && parent.expression === child;
}

export function unwrapValue(node) {
  return chainOf(unwrap(node), (current) =>
    ts.isAwaitExpression(current) ? unwrap(current.expression) : undefined,
  ).at(-1);
}

export function lineOf(node) {
  const sourceFile = node.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function columnOf(node) {
  const sourceFile = node.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).character + 1;
}

export function isClosure(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function childrenOf(node) {
  return syntaxChildren(node).filter((child) => !ts.isTypeNode(child));
}

export function descendants(root) {
  const nodes = [];
  for (const node of depthFirst(root, childrenOf)) {
    if (node !== root) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function outsideClosures(root) {
  const nodes = [];
  for (const node of depthFirst(root, (current) =>
    current !== root && isClosure(current) ? [] : childrenOf(current),
  )) {
    if (node !== root && !isClosure(node)) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function isAssignmentOperator(token) {
  return ASSIGNMENTS.has(token.kind);
}

export function isStep(node) {
  return (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  );
}

export function isWrite(node) {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent)) {
    return parent.left === node && isAssignmentOperator(parent.operatorToken);
  }
  return isStep(parent) || ts.isDeleteExpression(parent);
}

export function isPlainAssignment(node) {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

export function enclosingClosure(node) {
  const found = chainOf(node.parent, (current) =>
    isClosure(current) ? undefined : current.parent,
  ).at(-1);
  return found !== undefined && isClosure(found) ? found : undefined;
}

export function thisOwner(node) {
  const found = chainOf(enclosingClosure(node), (current) =>
    ts.isArrowFunction(current) ? enclosingClosure(current) : undefined,
  ).at(-1);
  return found !== undefined && ts.isArrowFunction(found) ? undefined : found;
}

export function memberName(node) {
  const name = node.name;
  if (name === undefined) {
    return undefined;
  }
  if (ts.isComputedPropertyName(name)) {
    return `[${name.expression.getText()}]`;
  }
  return name.getText();
}

export function staticName(node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

export function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

export function isAccess(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}
