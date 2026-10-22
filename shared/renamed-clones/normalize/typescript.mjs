import { newlines } from './scanner.mjs';

const COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|^#![^\n]*/gu;
const UNDERSCORE = '_ ';
const EMPTY_STRING = '"" ';
const ZERO = '0 ';

function withoutComments(gap) {
  return gap.replace(COMMENT, (comment) => `${newlines(comment)} `);
}

function createContext(ts, source) {
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
    wrappers: new Set([
      kind.PropertyAccessExpression,
      kind.ParenthesizedExpression,
      kind.NonNullExpression,
    ]),
    markup: new Set([kind.JsxOpeningElement, kind.JsxSelfClosingElement]),
  };
}

function innermost({ wrappers }, node) {
  const chain = [node];
  for (const current of chain) {
    if (wrappers.has(current.kind)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isSimple(context, node) {
  const { SyntaxKind: kind } = context.ts;
  const inner = innermost(context, node);
  return (
    context.simple.has(inner.kind) ||
    (inner.kind === kind.PrefixUnaryExpression && inner.operand.kind === kind.NumericLiteral)
  );
}

function dataChildren(context, node) {
  const { SyntaxKind: kind } = context.ts;
  if (isSimple(context, node)) {
    return [];
  }
  if (node.kind === kind.ArrayLiteralExpression) {
    return [...node.elements];
  }
  const assignments = node.kind === kind.ObjectLiteralExpression ? node.properties : undefined;
  if (assignments?.every((property) => property.kind === kind.PropertyAssignment)) {
    return assignments.map((property) => property.initializer);
  }
  return undefined;
}

function isDataValue(context, node) {
  const pending = [node];
  for (const current of pending) {
    const children = dataChildren(context, current);
    if (children === undefined) {
      return false;
    }
    pending.push(...children);
  }
  return true;
}

function isData(context, node) {
  const { SyntaxKind: kind } = context.ts;
  const literal =
    node.kind === kind.ArrayLiteralExpression || node.kind === kind.ObjectLiteralExpression;
  return literal && isDataValue(context, node);
}

function isDeclaredField(context, node) {
  const { SyntaxKind: kind } = context.ts;
  return (
    node.kind === kind.PropertyDeclaration &&
    (node.initializer === undefined || isDataValue(context, node.initializer))
  );
}

function keepExpression(context, holder) {
  const { expression } = holder;
  return expression !== undefined && !isSimple(context, expression) ? [expression] : [];
}

function attributeExpressions(context, attribute) {
  const { SyntaxKind: kind } = context.ts;
  if (attribute.kind === kind.JsxSpreadAttribute) {
    return keepExpression(context, attribute);
  }
  if (attribute.initializer?.kind === kind.JsxExpression) {
    return keepExpression(context, attribute.initializer);
  }
  return [];
}

function blankMarkup(context, element) {
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

function replacementFor(context, node) {
  const { SyntaxKind: kind } = context.ts;
  const emptyHolder =
    node.kind === kind.JsxExpression && keepExpression(context, node).length === 0;
  if (context.blanked.has(node.kind) || emptyHolder || isDeclaredField(context, node)) {
    return '';
  }
  if (context.tokens.has(node.kind)) {
    return context.tokens.get(node.kind);
  }
  return isData(context, node) ? ZERO : undefined;
}

function childNodes(context, node) {
  const children = [];
  context.ts.forEachChild(node, (child) => {
    children.push(child);
  });
  return children;
}

function visitNode(context, node) {
  if (context.markup.has(node.kind)) {
    return blankMarkup(context, node);
  }
  const text = replacementFor(context, node);
  if (text === undefined) {
    return childNodes(context, node);
  }
  context.edits.push({ start: node.getStart(context.source), end: node.getEnd(), text });
  return [];
}

function applyEdits(text, edits) {
  let output = '';
  let cursor = 0;
  for (const { start, end, text: replacement } of edits.sort((a, b) => a.start - b.start)) {
    output += withoutComments(text.slice(cursor, start));
    output += `${replacement}${newlines(text.slice(start, end))}`;
    cursor = end;
  }
  return output + withoutComments(text.slice(cursor));
}

export function normalizeTypescript(text, fileName, ts) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const context = createContext(ts, source);
  const pending = [source];
  for (const node of pending) {
    pending.push(...visitNode(context, node));
  }
  return applyEdits(text, context.edits);
}
