import type TypeScript from 'typescript';
import { chainOf } from '../../rules/typed/node-views.mts';
import { ts } from '../../rules/typed/typescript-views.mts';
import { isConstantName, type ConstantValue } from './copied-constants-views.mts';

export type ConstantEntry = readonly [string, ConstantValue];
type Modified = { readonly modifiers?: TypeScript.NodeArray<TypeScript.ModifierLike> | undefined };

const HIDDEN_MEMBERS = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword];

function isWrapper(
  node: TypeScript.Node,
): node is
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.ParenthesizedExpression
  | TypeScript.TypeAssertion {
  return (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

function unwrapped(node: TypeScript.Node): TypeScript.Node {
  return chainOf(node, (link) => (isWrapper(link) ? link.expression : undefined)).at(-1) ?? node;
}

function numberOf(node: TypeScript.Node): number | undefined {
  return ts.isNumericLiteral(node) ? Number(node.text.replaceAll('_', '')) : undefined;
}

function negatedNumber(node: TypeScript.PrefixUnaryExpression): ConstantValue | undefined {
  const negated = numberOf(unwrapped(node.operand));
  return negated === undefined ? undefined : { kind: 'number', value: -negated };
}

function literalValue(initializer: TypeScript.Node | undefined): ConstantValue | undefined {
  const node = initializer === undefined ? undefined : unwrapped(initializer);
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'string', value: node.text };
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return negatedNumber(node);
  }
  const value = numberOf(node);
  return value === undefined ? undefined : { kind: 'number', value };
}

export function hasModifier(node: Modified, kind: TypeScript.SyntaxKind): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function isStaticConstant(
  member: TypeScript.ClassElement,
  javascript: boolean,
): member is TypeScript.PropertyDeclaration & { readonly name: TypeScript.Identifier } {
  return (
    ts.isPropertyDeclaration(member) &&
    ts.isIdentifier(member.name) &&
    hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
    (javascript || hasModifier(member, ts.SyntaxKind.ReadonlyKeyword)) &&
    !HIDDEN_MEMBERS.some((kind) => hasModifier(member, kind)) &&
    isConstantName(member.name.text)
  );
}

function classConstants(statement: TypeScript.Statement, javascript: boolean): ConstantEntry[] {
  if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
    return [];
  }
  const owner = statement.name.text;
  return statement.members
    .filter((member) => isStaticConstant(member, javascript))
    .flatMap((member) => {
      const value = literalValue(member.initializer);
      return value === undefined ? [] : [[`${owner}.${member.name.text}`, value]];
    });
}

export function localConstants(
  statement: TypeScript.Statement,
  javascript: boolean,
): ConstantEntry[] {
  const isConst =
    ts.isVariableStatement(statement) &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
  if (!isConst) {
    return classConstants(statement, javascript);
  }
  return statement.declarationList.declarations.flatMap(({ name, initializer }) => {
    if (!ts.isIdentifier(name)) {
      return [];
    }
    const value = literalValue(initializer);
    return value === undefined ? [] : [[name.text, value]];
  });
}
