import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from '../typed/lazy-typescript-api.mts';
import { appendAll } from '../../../../shared/lists/lists.mts';

type Edit = { readonly start: number; readonly end: number };
type Check = (source: string, edit: Edit) => boolean;
type Api = typeof TypeScript;

const PLAIN_NAMES = new Set(['undefined', 'NaN', 'Infinity']);
const QUANTIFIER_PARTS = new Set(['{', '}', ',']);

function isWrapper(
  ts: Api,
  node: TypeScript.Expression,
): node is TypeScript.Expression & {
  readonly expression: TypeScript.Expression;
} {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  );
}

function propertyValues(
  ts: Api,
  node: TypeScript.ObjectLiteralExpression,
): readonly TypeScript.Expression[] | undefined {
  const values: TypeScript.Expression[] = [];
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
      return undefined;
    }
    values.push(property.initializer);
  }
  return values;
}

function isPlainLeaf(ts: Api, node: TypeScript.Expression): boolean {
  return (
    ts.isLiteralExpression(node) ||
    (ts.isIdentifier(node) && PLAIN_NAMES.has(node.text)) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isPrefixUnaryExpression(node) &&
      (ts.isNumericLiteral(node.operand) || ts.isBigIntLiteral(node.operand)))
  );
}

function pureParts(
  ts: Api,
  node: TypeScript.Expression,
): readonly TypeScript.Expression[] | undefined {
  if (isWrapper(ts, node)) {
    return [node.expression];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => ts.isSpreadElement(element)) ? undefined : node.elements;
  }
  if (ts.isObjectLiteralExpression(node)) {
    return propertyValues(ts, node);
  }
  return isPlainLeaf(ts, node) ? [] : undefined;
}

function isPureValue(ts: Api, node: TypeScript.Expression): boolean {
  const pending = [node];
  for (const current of pending) {
    const parts = pureParts(ts, current);
    if (parts === undefined) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}

function isPureMember(ts: Api, member: TypeScript.ClassElement): boolean {
  const decorated = ts.canHaveDecorators(member) && (ts.getDecorators(member)?.length ?? 0) > 0;
  if (decorated) {
    return false;
  }
  return !ts.isPropertyDeclaration(member) || member.initializer === undefined
    ? true
    : isPureValue(ts, member.initializer);
}

function removesPureMembers(source: string, edit: Edit): boolean {
  const ts = lazyTypeScriptApi();
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
    statement.members.every((member) => isPureMember(ts, member))
  );
}

function regexAt(ts: Api, file: TypeScript.Node, offset: number): TypeScript.Node | undefined {
  const path = [file];
  for (const node of path) {
    const inside = node
      .getChildren()
      .find((child) => child.getStart() <= offset && offset < child.end);
    if (inside === undefined || inside.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      return inside;
    }
    path.push(inside);
  }
  return undefined;
}

function isInClass(pattern: string, offset: number): boolean {
  let inClass = false;
  let escaped = false;
  for (const character of pattern.slice(1, offset).split('')) {
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '[') {
      inClass = true;
    } else if (character === ']') {
      inClass = false;
    }
  }
  return inClass;
}

function keepsRegexSyntax(source: string, edit: Edit): boolean {
  const ts = lazyTypeScriptApi();
  const file = ts.createSourceFile('escaped.ts', source, ts.ScriptTarget.Latest, true);
  const regex = regexAt(ts, file, edit.start);
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
