import type TypeScript from 'typescript';
import {
  ts,
  chainOf as optionalChainOf,
  depthFirst,
  nonEmptyChainOf as chainOf,
  syntaxChildren,
} from './typed.mts';

type Node = TypeScript.Node;
type Closure =
  | TypeScript.ArrowFunction
  | TypeScript.FunctionExpression
  | TypeScript.FunctionDeclaration
  | TypeScript.MethodDeclaration
  | TypeScript.ConstructorDeclaration
  | TypeScript.GetAccessorDeclaration
  | TypeScript.SetAccessorDeclaration;

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

export function isWrapper(
  node: Node,
): node is
  | TypeScript.ParenthesizedExpression
  | TypeScript.NonNullExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.TypeAssertion {
  return WRAPPERS.some((test) => test(node));
}

export function unwrap(node: Node): Node {
  return chainOf(node, (current) => (isWrapper(current) ? current.expression : undefined)).at(-1);
}

export function isValueWrapper(parent: Node, child: Node): boolean {
  return (isWrapper(parent) || ts.isAwaitExpression(parent)) && parent.expression === child;
}

export function unwrapValue(node: Node): Node {
  return chainOf(unwrap(node), (current) =>
    ts.isAwaitExpression(current) ? unwrap(current.expression) : undefined,
  ).at(-1);
}

export function lineOf(node: Node): number {
  const sourceFile = node.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function isClosure(node: Node): node is Closure {
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

function childrenOf(node: Node): Node[] {
  return syntaxChildren(node).filter((child) => !ts.isTypeNode(child));
}

export function descendants(root: Node): Node[] {
  const nodes: Node[] = [];
  for (const node of depthFirst(root, childrenOf)) {
    if (node !== root) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function outsideClosures(root: Node): Node[] {
  const nodes: Node[] = [];
  for (const node of depthFirst(root, (current) =>
    current !== root && isClosure(current) ? [] : childrenOf(current),
  )) {
    if (node !== root && !isClosure(node)) {
      nodes.push(node);
    }
  }
  return nodes;
}

export function isAssignmentOperator(token: Node): boolean {
  return ASSIGNMENTS.has(token.kind);
}

export function isStep(
  node: Node,
): node is TypeScript.PrefixUnaryExpression | TypeScript.PostfixUnaryExpression {
  return (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken)
  );
}

export function isWrite(node: Node): boolean {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent)) {
    return parent.left === node && isAssignmentOperator(parent.operatorToken);
  }
  return isStep(parent) || ts.isDeleteExpression(parent);
}

export function isPlainAssignment(node: Node): boolean {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

export function enclosingClosure(node: Node): Closure | undefined {
  const found = optionalChainOf(node.parent, (current) =>
    isClosure(current) ? undefined : current.parent,
  ).at(-1);
  return found !== undefined && isClosure(found) ? found : undefined;
}

export function thisOwner(node: Node): Closure | undefined {
  const found = optionalChainOf(enclosingClosure(node), (current) =>
    ts.isArrowFunction(current) ? enclosingClosure(current) : undefined,
  ).at(-1);
  return found !== undefined && ts.isArrowFunction(found) ? undefined : found;
}

export function memberName(node: Node & { readonly name?: Node | undefined }): string | undefined {
  const name = node.name;
  if (name === undefined) {
    return undefined;
  }
  if (ts.isComputedPropertyName(name)) {
    return `[${name.expression.getText()}]`;
  }
  return name.getText();
}

export function staticName(node: Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

export function accessedName(node: Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

export function isAccess(
  node: Node,
): node is TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

export function heritageClausesOf(node: Node): readonly TypeScript.HeritageClause[] {
  return ts.isClassLike(node) || ts.isInterfaceDeclaration(node)
    ? (node.heritageClauses ?? [])
    : [];
}

export function declaredTypeOf(declaration: Node | undefined): TypeScript.TypeNode | undefined {
  return declaration !== undefined &&
    (ts.isParameter(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isPropertySignature(declaration))
    ? declaration.type
    : undefined;
}
