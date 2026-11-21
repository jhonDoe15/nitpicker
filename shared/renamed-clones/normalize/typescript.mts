import type TypeScript from 'typescript';
import { expandsFully } from '../../traversal.mts';
import { newlines } from './scanner.mts';
import { appendAll } from '../../lists/lists.mts';

type Edit = { readonly start: number; readonly end: number; readonly text: string };

type Wrapper =
  | TypeScript.PropertyAccessExpression
  | TypeScript.ParenthesizedExpression
  | TypeScript.NonNullExpression;

type Context = {
  readonly ts: typeof TypeScript;
  readonly source: TypeScript.SourceFile;
  readonly edits: Edit[];
  readonly blanked: ReadonlySet<TypeScript.SyntaxKind>;
  readonly tokens: ReadonlyMap<TypeScript.SyntaxKind, string>;
  readonly simple: ReadonlySet<TypeScript.SyntaxKind>;
};

const COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|^#![^\n]*/gu;
const UNDERSCORE = '_ ';
const EMPTY_STRING = '"" ';
const ZERO = '0 ';

function withoutComments(gap: string): string {
  return gap.replace(COMMENT, (comment) => `${newlines(comment)} `);
}

function createContext(ts: typeof TypeScript, source: TypeScript.SourceFile): Context {
  const { SyntaxKind: kind } = ts;
  return {
    ts,
    source,
    edits: [],
    blanked: new Set([
      kind.ImportDeclaration,
      kind.ImportEqualsDeclaration,
      kind.ExportDeclaration,
      kind.InterfaceDeclaration,
      kind.TypeAliasDeclaration,
      kind.EnumDeclaration,
      kind.JsxText,
      kind.JsxClosingElement,
      kind.JsxOpeningFragment,
      kind.JsxClosingFragment,
    ]),
    tokens: new Map([
      [kind.Identifier, UNDERSCORE],
      [kind.PrivateIdentifier, UNDERSCORE],
      [kind.StringLiteral, EMPTY_STRING],
      [kind.NoSubstitutionTemplateLiteral, EMPTY_STRING],
      [kind.NumericLiteral, ZERO],
      [kind.BigIntLiteral, ZERO],
      [kind.RegularExpressionLiteral, '/_/ '],
      [kind.TemplateHead, '`${'],
      [kind.TemplateMiddle, '}${'],
      [kind.TemplateTail, '}` '],
    ]),
    simple: new Set([
      kind.Identifier,
      kind.StringLiteral,
      kind.NumericLiteral,
      kind.NoSubstitutionTemplateLiteral,
      kind.TrueKeyword,
      kind.FalseKeyword,
      kind.NullKeyword,
      kind.ThisKeyword,
    ]),
  };
}

function isWrapper(ts: typeof TypeScript, node: TypeScript.Node): node is Wrapper {
  return (
    ts.isPropertyAccessExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node)
  );
}

function innermost(context: Context, node: TypeScript.Node): TypeScript.Node {
  const pending = [node];
  for (const current of pending) {
    if (!isWrapper(context.ts, current)) {
      return current;
    }
    pending.push(current.expression);
  }
  return node;
}

function isSimple(context: Context, node: TypeScript.Node): boolean {
  const { SyntaxKind: kind } = context.ts;
  const inner = innermost(context, node);
  return (
    context.simple.has(inner.kind) ||
    (context.ts.isPrefixUnaryExpression(inner) && inner.operand.kind === kind.NumericLiteral)
  );
}

function dataChildren(context: Context, node: TypeScript.Node): TypeScript.Node[] | undefined {
  const { ts } = context;
  if (isSimple(context, node)) {
    return [];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return [...node.elements];
  }
  const assignments = ts.isObjectLiteralExpression(node) ? node.properties : undefined;
  const found = assignments?.filter(ts.isPropertyAssignment);
  if (assignments !== undefined && found?.length === assignments.length) {
    return found.map((property) => property.initializer);
  }
  return undefined;
}

function isDataValue(context: Context, node: TypeScript.Node): boolean {
  return expandsFully(node, (current) => dataChildren(context, current));
}

function isData(context: Context, node: TypeScript.Node): boolean {
  const { ts } = context;
  const literal = ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node);
  return literal && isDataValue(context, node);
}

function isDeclaredField(context: Context, node: TypeScript.Node): boolean {
  return (
    context.ts.isPropertyDeclaration(node) &&
    (node.initializer === undefined || isDataValue(context, node.initializer))
  );
}

function keepExpression(
  context: Context,
  holder: { readonly expression?: TypeScript.Expression | undefined },
): TypeScript.Expression[] {
  const { expression } = holder;
  return expression !== undefined && !isSimple(context, expression) ? [expression] : [];
}

function attributeExpressions(
  context: Context,
  attribute: TypeScript.JsxAttributeLike,
): TypeScript.Expression[] {
  const { ts } = context;
  if (ts.isJsxSpreadAttribute(attribute)) {
    return keepExpression(context, attribute);
  }
  if (attribute.initializer !== undefined && ts.isJsxExpression(attribute.initializer)) {
    return keepExpression(context, attribute.initializer);
  }
  return [];
}

function blankMarkup(
  context: Context,
  element: TypeScript.JsxOpeningElement | TypeScript.JsxSelfClosingElement,
): TypeScript.Expression[] {
  const expressions = element.attributes.properties.flatMap((attribute) =>
    attributeExpressions(context, attribute),
  );
  let cursor = element.getStart(context.source);
  for (const expression of expressions) {
    context.edits.push({ start: cursor, end: expression.getStart(context.source), text: '' });
    cursor = expression.getEnd();
  }
  context.edits.push({ start: cursor, end: element.getEnd(), text: '' });
  return expressions;
}

function replacementFor(context: Context, node: TypeScript.Node): string | undefined {
  const emptyHolder =
    context.ts.isJsxExpression(node) && keepExpression(context, node).length === 0;
  if (context.blanked.has(node.kind) || emptyHolder || isDeclaredField(context, node)) {
    return '';
  }
  const token = context.tokens.get(node.kind);
  if (token !== undefined) {
    return token;
  }
  return isData(context, node) ? ZERO : undefined;
}

function childNodes(context: Context, node: TypeScript.Node): TypeScript.Node[] {
  const children: TypeScript.Node[] = [];
  context.ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function visitNode(context: Context, node: TypeScript.Node): readonly TypeScript.Node[] {
  if (context.ts.isJsxOpeningElement(node) || context.ts.isJsxSelfClosingElement(node)) {
    return blankMarkup(context, node);
  }
  const text = replacementFor(context, node);
  if (text === undefined) {
    return childNodes(context, node);
  }
  context.edits.push({ start: node.getStart(context.source), end: node.getEnd(), text });
  return [];
}

function applyEdits(text: string, edits: Edit[]): string {
  let output = '';
  let cursor = 0;
  for (const { start, end, text: replacement } of edits.sort((a, b) => a.start - b.start)) {
    output += withoutComments(text.slice(cursor, start));
    output += `${replacement}${newlines(text.slice(start, end))}`;
    cursor = end;
  }
  return output + withoutComments(text.slice(cursor));
}

export function normalizeTypescript(text: string, fileName: string, ts: typeof TypeScript): string {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const context = createContext(ts, source);
  const pending: TypeScript.Node[] = [source];
  for (const node of pending) {
    appendAll(pending, visitNode(context, node));
  }
  return applyEdits(text, context.edits);
}
