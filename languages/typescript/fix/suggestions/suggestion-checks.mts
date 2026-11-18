import type TypeScript from 'typescript';
import { ts } from '../../preset/eslint-plugin/rules/typed/typescript-views.mts';

type Edit = { readonly start: number; readonly end: number };
type Check = (source: string, edit: Edit) => boolean;

const PLAIN_NAMES = new Set(['undefined', 'NaN', 'Infinity']);
const QUANTIFIER_PARTS = new Set(['{', '}', ',']);

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
        ts.isPropertyAssignment(property) &&
        !ts.isComputedPropertyName(property.name) &&
        isPureValue(property.initializer),
    );
  }
  return (
    ts.isLiteralExpression(node) ||
    (ts.isIdentifier(node) && PLAIN_NAMES.has(node.text)) ||
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

function removesPureMembers(source: string, edit: Edit): boolean {
  const removed = source.slice(edit.start, edit.end);
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

function regexAt(file: TypeScript.Node, offset: number): TypeScript.Node | undefined {
  const inside = file
    .getChildren()
    .find((child) => child.getStart() <= offset && offset < child.end);
  if (inside === undefined || inside.kind === ts.SyntaxKind.RegularExpressionLiteral) {
    return inside;
  }
  return regexAt(inside, offset);
}

function isInClass(pattern: string, offset: number): boolean {
  let inClass = false;
  for (let index = 1; index < offset; index += 1) {
    const character = pattern.charAt(index);
    if (character === '\\') {
      index += 1;
    } else if (character === '[') {
      inClass = true;
    } else if (character === ']') {
      inClass = false;
    }
  }
  return inClass;
}

function keepsRegexSyntax(source: string, edit: Edit): boolean {
  const file = ts.createSourceFile('escaped.ts', source, ts.ScriptTarget.Latest, true);
  const regex = regexAt(file, edit.start);
  if (regex?.kind !== ts.SyntaxKind.RegularExpressionLiteral) {
    return true;
  }
  const start = regex.getStart();
  return (
    isInClass(source.slice(start, regex.end), edit.start - start) ||
    !QUANTIFIER_PARTS.has(source.charAt(edit.end))
  );
}

const CHECKS: Readonly<Record<string, Check>> = {
  'no-unused-private-class-members': removesPureMembers,
  'no-useless-escape': keepsRegexSyntax,
};

export function keepsBehaviour(
  rule: string | undefined,
  source: string,
  edit: { readonly start: number; readonly end: number },
): boolean {
  const check = rule === undefined ? undefined : CHECKS[rule];
  return check === undefined || check(source, edit);
}
