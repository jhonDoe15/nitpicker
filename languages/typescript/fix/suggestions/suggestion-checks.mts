import type TypeScript from 'typescript';
import { ts } from '../../preset/eslint-plugin/rules/typed/typescript-views.mts';

type Check = (removed: string) => boolean;

function isPureValue(node: TypeScript.Expression): boolean {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return isPureValue(node.expression);
  }
  if (ts.isPrefixUnaryExpression(node)) {
    return ts.isNumericLiteral(node.operand) || ts.isBigIntLiteral(node.operand);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((element) => !ts.isSpreadElement(element) && isPureValue(element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (property) =>
        ts.isShorthandPropertyAssignment(property) ||
        (ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name) &&
          isPureValue(property.initializer)),
    );
  }
  return (
    ts.isLiteralExpression(node) ||
    ts.isIdentifier(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  );
}

function isPureMember(member: TypeScript.ClassElement): boolean {
  const decorated = ts.canHaveDecorators(member) && (ts.getDecorators(member)?.length ?? 0) > 0;
  if (decorated) {
    return false;
  }
  return !ts.isPropertyDeclaration(member) || member.initializer === undefined
    ? true
    : isPureValue(member.initializer);
}

function removesPureMembers(removed: string): boolean {
  const file = ts.createSourceFile(
    'removed.ts',
    `class Removed {\n${removed}\n}\n`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const [statement] = file.statements;
  return (
    file.statements.length === 1 &&
    statement !== undefined &&
    ts.isClassDeclaration(statement) &&
    statement.members.length > 0 &&
    statement.members.every(isPureMember)
  );
}

const CHECKS: Readonly<Record<string, Check>> = {
  'no-unused-private-class-members': removesPureMembers,
};

export function keepsBehaviour(
  rule: string | undefined,
  source: string,
  edit: { readonly start: number; readonly end: number },
): boolean {
  const check = rule === undefined ? undefined : CHECKS[rule];
  return check === undefined || check(source.slice(edit.start, edit.end));
}
