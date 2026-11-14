import { ts } from '../../../typescript-api/typescript-api.mjs';

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

export function normalizedText(node, sourceFile) {
  return node.getText(sourceFile).replaceAll(/\s+/gu, ' ');
}

export function childrenOf(node) {
  const found = [];
  ts.forEachChild(node, (child) => {
    found.push(child);
  });
  return found;
}

export function descendants(root) {
  const found = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    pending.push(...childrenOf(node));
  }
  return found;
}

function isNameOf(parent, node) {
  return parent.name === node;
}

function isMemberName(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && isNameOf(parent, node)) ||
    (NAMED_PARENTS.some((test) => test(parent)) && isNameOf(parent, node)) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

function isOtherName(parent) {
  return (
    ts.isQualifiedName(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent)
  );
}

function bindingRole(parent) {
  return ts.isObjectBindingPattern(parent.parent) && parent.propertyName === undefined
    ? SHORTHAND
    : 'declaration';
}

export function roleOf(node) {
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

export function symbolAt(node, checker) {
  return roleOf(node) === SHORTHAND && ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
}

export function followed(start, next) {
  const chain = [start];
  for (const current of chain) {
    const after = next(current);
    if (after !== undefined) {
      chain.push(after);
    }
  }
  return chain.at(-1);
}

function transparentParent(node) {
  const parent = node.parent;
  const assignedValue = ts.isPropertyAssignment(parent) && parent.initializer === node;
  return assignedValue || TRANSPARENT_PARENTS.some((test) => test(parent)) ? parent : undefined;
}

function isAssignmentOperator(kind) {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isAssigned(parent, current) {
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === current &&
    isAssignmentOperator(parent.operatorToken.kind)
  );
}

function isStepped(parent) {
  const operators = [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken];
  return (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    operators.includes(parent.operator)
  );
}

function isEnumerated(parent, current) {
  return (
    (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === current
  );
}

export function isWritten(node) {
  const current = followed(node, transparentParent);
  const parent = current.parent;
  return (
    isAssigned(parent, current) ||
    isStepped(parent) ||
    isEnumerated(parent, current) ||
    (ts.isDeleteExpression(parent) && parent.expression === current)
  );
}

function isCallee(node) {
  const parent = node.parent;
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === node)
  );
}

function isMemberAccess(node) {
  const inner = followed(node, (current) =>
    ts.isParenthesizedExpression(current) ? current.expression : undefined,
  );
  return ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner);
}

function isConstructed(node) {
  return ts.isNewExpression(node.parent) && node.parent.expression === node;
}

function isModuleLoad(node) {
  const parent = node.parent;
  const callee = ts.isCallExpression(parent) ? parent.expression : undefined;
  return (
    callee !== undefined &&
    parent.arguments[0] === node &&
    (callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && callee.text === 'require'))
  );
}

export function isValuePosition(node) {
  const plain = ts.isExpression(node) && !isWritten(node);
  return (
    plain &&
    !isConstructed(node) &&
    !isModuleLoad(node) &&
    !(isCallee(node) && isMemberAccess(node))
  );
}

function isNumericSign(node) {
  const signs = [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken];
  return (
    ts.isPrefixUnaryExpression(node) &&
    signs.includes(node.operator) &&
    ts.isNumericLiteral(node.operand)
  );
}

export function isLiteralValue(node) {
  const keywords = [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword];
  return (
    isNumericSign(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    keywords.includes(node.kind)
  );
}

export function isTypeScriptFile(name) {
  return /\.[cm]?tsx?$/u.test(name);
}
