import { ts } from '../../../../typescript-api/typescript-api.mjs';

const FLAGS = ['isDeleted', 'deleted', 'deletedAt', 'archived', 'hidden', 'isVisible'];
const TRUE_FLAGS = new Set(['isVisible']);
const ABSENT_FLAGS = new Set(['deletedAt']);
const DECLARING_PARENTS = new Set([
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
]);

function isDeclaringMember(declaration) {
  const { parent } = declaration;
  if (parent === undefined) {
    return false;
  }
  const typeAlias = ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent);
  return DECLARING_PARENTS.has(parent.kind) || typeAlias;
}

function declarationKey(symbol) {
  const declaration = symbol.declarations?.find(isDeclaringMember);
  if (declaration === undefined) {
    return undefined;
  }
  return `${declaration.getSourceFile().fileName}#${String(declaration.getStart())}`;
}

function isNarrowedType(name, type) {
  if (TRUE_FLAGS.has(name)) {
    return (type.flags & ts.TypeFlags.BooleanLiteral) !== 0 && type.intrinsicName === 'true';
  }
  if (ABSENT_FLAGS.has(name)) {
    return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0;
  }
  return (type.flags & ts.TypeFlags.BooleanLiteral) !== 0 && type.intrinsicName === 'false';
}

function isDate(type) {
  return type.symbol?.name === 'Date';
}

function isFlagType(name, type) {
  const parts = type.isUnion() ? type.types : [type];
  const empty = ts.TypeFlags.Null | ts.TypeFlags.Undefined;
  if (ABSENT_FLAGS.has(name)) {
    const stamp = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike;
    const nullable = parts.some((part) => (part.flags & empty) !== 0);
    return (
      parts.every((part) => (part.flags & (empty | stamp)) !== 0 || isDate(part)) &&
      (nullable || parts.some(isDate))
    );
  }
  return (
    parts.every((part) => (part.flags & (empty | ts.TypeFlags.BooleanLike)) !== 0) &&
    parts.some((part) => (part.flags & ts.TypeFlags.BooleanLike) !== 0)
  );
}

export function flagOf(checker, type, location) {
  for (const name of FLAGS) {
    const symbol = checker.getPropertyOfType(type, name);
    const key = symbol === undefined ? undefined : declarationKey(symbol);
    const flagType =
      key === undefined ? undefined : checker.getTypeOfSymbolAtLocation(symbol, location);
    if (flagType !== undefined && isFlagType(name, flagType)) {
      return { name, key, narrowed: isNarrowedType(name, flagType), alias: type.aliasSymbol?.name };
    }
  }
  return undefined;
}

const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

function isAssigned(identifier) {
  const access = identifier.parent;
  const assignment = access?.parent;
  return (
    ts.isPropertyAccessExpression(access) &&
    access.name === identifier &&
    ts.isBinaryExpression(assignment) &&
    assignment.left === access &&
    ASSIGNMENTS.has(assignment.operatorToken.kind)
  );
}

function walkIdentifiers(root, test) {
  const pending = [root];
  for (const node of pending) {
    if (ts.isIdentifier(node) && test(node)) {
      return true;
    }
    pending.push(...node.getChildren());
  }
  return false;
}

export function mentionsFlag(root, name) {
  return walkIdentifiers(root, (node) => node.text === name && !isAssigned(node));
}

export function assignsFlag(root, name) {
  return walkIdentifiers(root, (node) => node.text === name && isAssigned(node));
}
