import type TypeScript from 'typescript';
import { chainOf, childrenOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

type Role = 'other' | 'member' | 'shorthand' | 'declaration' | 'reference';

const ts = typescriptApi();

const MEMBER = 'member';
const SHORTHAND = 'shorthand';
const NAMED_PARENTS = [
  ts.isPropertyAssignment,
  ts.isMethodDeclaration,
  ts.isPropertyDeclaration,
  ts.isGetAccessorDeclaration,
  ts.isSetAccessorDeclaration,
  ts.isEnumMember,
  ts.isPropertySignature,
  ts.isMethodSignature,
];

const DECLARING_PARENTS = [
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isClassDeclaration,
  ts.isClassExpression,
];

const TRANSPARENT_PARENTS = [
  ts.isParenthesizedExpression,
  ts.isArrayLiteralExpression,
  ts.isSpreadElement,
  ts.isObjectLiteralExpression,
  ts.isShorthandPropertyAssignment,
];

export function normalizedText(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): string {
  return node.getText(sourceFile).replaceAll(/\s+/gu, ' ');
}

export function descendants(root: TypeScript.Node): TypeScript.Node[] {
  const found: TypeScript.Node[] = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    appendAll(pending, childrenOf(node));
  }
  return found;
}

function isNameOf(parent: TypeScript.Node, node: TypeScript.Node): boolean {
  return fieldOf(parent, 'name') === node;
}

function isMemberName(node: TypeScript.Node): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && isNameOf(parent, node)) ||
    (NAMED_PARENTS.some((test) => test(parent)) && isNameOf(parent, node)) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

function isOtherName(parent: TypeScript.Node): boolean {
  return (
    ts.isQualifiedName(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent)
  );
}

function bindingRole(parent: TypeScript.BindingElement): Role {
  return ts.isObjectBindingPattern(parent.parent) && parent.propertyName === undefined
    ? SHORTHAND
    : 'declaration';
}

export function roleOf(node: TypeScript.Node): Role {
  const parent = node.parent;
  if (isOtherName(parent)) {
    return 'other';
  }
  if (isMemberName(node)) {
    return MEMBER;
  }
  if (ts.isBindingElement(parent)) {
    return bindingRole(parent);
  }
  if (ts.isShorthandPropertyAssignment(parent) && isNameOf(parent, node)) {
    return SHORTHAND;
  }
  return DECLARING_PARENTS.some((test) => test(parent)) && isNameOf(parent, node)
    ? 'declaration'
    : 'reference';
}

export function symbolAt(
  node: TypeScript.Node,
  checker: TypeScript.TypeChecker,
): TypeScript.Symbol | undefined {
  return roleOf(node) === SHORTHAND && ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
}

function transparentParent(node: TypeScript.Node): TypeScript.Node | undefined {
  const parent = node.parent;
  const assignedValue = ts.isPropertyAssignment(parent) && parent.initializer === node;
  return assignedValue || TRANSPARENT_PARENTS.some((test) => test(parent)) ? parent : undefined;
}

function isAssignmentOperator(kind: TypeScript.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isAssigned(parent: TypeScript.Node, current: TypeScript.Node): boolean {
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === current &&
    isAssignmentOperator(parent.operatorToken.kind)
  );
}

function isStepped(parent: TypeScript.Node): boolean {
  const operators = [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken];
  return (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    operators.includes(parent.operator)
  );
}

function isEnumerated(parent: TypeScript.Node, current: TypeScript.Node): boolean {
  return (
    (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === current
  );
}

export function isWritten(node: TypeScript.Node): boolean {
  const current = chainOf(node, transparentParent).at(-1) ?? node;
  const parent = current.parent;
  return (
    isAssigned(parent, current) ||
    isStepped(parent) ||
    isEnumerated(parent, current) ||
    (ts.isDeleteExpression(parent) && parent.expression === current)
  );
}

function isCallee(node: TypeScript.Node): boolean {
  const parent = node.parent;
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === node)
  );
}

function isMemberAccess(node: TypeScript.Node): boolean {
  const inner =
    chainOf<TypeScript.Node>(node, (current) =>
      ts.isParenthesizedExpression(current) ? current.expression : undefined,
    ).at(-1) ?? node;
  return ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner);
}

function isConstructed(node: TypeScript.Node): boolean {
  return ts.isNewExpression(node.parent) && node.parent.expression === node;
}

function isModuleLoad(node: TypeScript.Node): boolean {
  const parent = node.parent;
  if (!ts.isCallExpression(parent)) {
    return false;
  }
  const callee = parent.expression;
  return (
    parent.arguments[0] === node &&
    (callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && callee.text === 'require'))
  );
}

export function isValuePosition(node: TypeScript.Node): boolean {
  const plain = ts.isExpression(node) && !isWritten(node);
  return (
    plain &&
    !isConstructed(node) &&
    !isModuleLoad(node) &&
    !(isCallee(node) && isMemberAccess(node))
  );
}

function isNumericSign(node: TypeScript.Node): boolean {
  const signs = [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken];
  return (
    ts.isPrefixUnaryExpression(node) &&
    signs.includes(node.operator) &&
    ts.isNumericLiteral(node.operand)
  );
}

export function isLiteralValue(node: TypeScript.Node): boolean {
  const keywords = [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword];
  return (
    isNumericSign(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    keywords.includes(node.kind)
  );
}

export function isTypeScriptFile(name: string): boolean {
  return /\.[cm]?tsx?$/u.test(name);
}
