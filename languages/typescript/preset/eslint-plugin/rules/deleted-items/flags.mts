import type TypeScript from 'typescript';
import { parentOf, ts } from '../typed/typescript-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

export type Flag = {
  readonly name: string;
  readonly key: string;
  readonly narrowed: boolean;
  readonly alias: string | undefined;
};

const FLAGS = ['isDeleted', 'deleted', 'deletedAt', 'archived', 'hidden', 'isVisible'];
const TRUE_FLAGS = new Set(['isVisible']);
const ABSENT_FLAGS = new Set(['deletedAt']);
const DECLARING_PARENTS = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.ClassExpression,
]);

const WRAPPING_TYPES = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.TypeReference,
  ts.SyntaxKind.IntersectionType,
  ts.SyntaxKind.UnionType,
  ts.SyntaxKind.ParenthesizedType,
  ts.SyntaxKind.TypeOperator,
]);

function unwrapped(node: TypeScript.Node): TypeScript.Node {
  const chain = [node];
  for (const current of chain) {
    if (WRAPPING_TYPES.has(current.kind)) {
      chain.push(current.parent);
    }
  }
  return chain.at(-1) ?? node;
}

function isAliasedLiteral(literal: TypeScript.Node): boolean {
  return ts.isTypeAliasDeclaration(unwrapped(literal.parent));
}

function isDeclaringMember(declaration: TypeScript.Declaration): boolean {
  const parent = parentOf(declaration);
  if (parent === undefined) {
    return false;
  }
  const typeAlias = ts.isTypeLiteralNode(parent) && isAliasedLiteral(parent);
  return DECLARING_PARENTS.has(parent.kind) || typeAlias;
}

function declarationKey(symbol: TypeScript.Symbol): string | undefined {
  const declaration = symbol.declarations?.find(isDeclaringMember);
  if (declaration === undefined) {
    return undefined;
  }
  return `${declaration.getSourceFile().fileName}#${String(declaration.getStart())}`;
}

function isIntrinsic(type: TypeScript.Type, expected: string): boolean {
  return (
    (type.flags & ts.TypeFlags.BooleanLiteral) !== 0 &&
    'intrinsicName' in type &&
    type.intrinsicName === expected
  );
}

function isNarrowedType(name: string, type: TypeScript.Type): boolean {
  if (TRUE_FLAGS.has(name)) {
    return isIntrinsic(type, 'true');
  }
  if (ABSENT_FLAGS.has(name)) {
    return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) !== 0;
  }
  return isIntrinsic(type, 'false');
}

function isDate(type: TypeScript.Type): boolean {
  return type.getSymbol()?.name === 'Date';
}

function isFlagType(name: string, type: TypeScript.Type): boolean {
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

export function flagOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
  location: TypeScript.Node,
): Flag | undefined {
  for (const name of FLAGS) {
    const symbol = checker.getPropertyOfType(type, name);
    const key = symbol === undefined ? undefined : declarationKey(symbol);
    const flagType =
      symbol === undefined || key === undefined
        ? undefined
        : checker.getTypeOfSymbolAtLocation(symbol, location);
    if (key !== undefined && flagType !== undefined && isFlagType(name, flagType)) {
      return { name, key, narrowed: isNarrowedType(name, flagType), alias: type.aliasSymbol?.name };
    }
  }
  return undefined;
}

const ASSIGNMENTS = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
]);

function isAssigned(identifier: TypeScript.Identifier): boolean {
  const access = parentOf(identifier);
  const assignment = access === undefined ? undefined : parentOf(access);
  return (
    access !== undefined &&
    assignment !== undefined &&
    ts.isPropertyAccessExpression(access) &&
    access.name === identifier &&
    ts.isBinaryExpression(assignment) &&
    assignment.left === access &&
    ASSIGNMENTS.has(assignment.operatorToken.kind)
  );
}

function walkIdentifiers(
  root: TypeScript.Node,
  test: (node: TypeScript.Identifier) => boolean,
): boolean {
  const pending = [root];
  for (const node of pending) {
    if (ts.isIdentifier(node) && test(node)) {
      return true;
    }
    appendAll(pending, node.getChildren());
  }
  return false;
}

export function mentionsFlag(root: TypeScript.Node, name: string): boolean {
  return walkIdentifiers(root, (node) => node.text === name && !isAssigned(node));
}

export function assignsFlag(root: TypeScript.Node, name: string): boolean {
  return walkIdentifiers(root, (node) => node.text === name && isAssigned(node));
}
