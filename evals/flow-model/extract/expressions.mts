import ts from 'typescript';
import type {
  Callee,
  ComparisonOperator,
  Expr,
  ExtractContext,
  LitValue,
} from '../model/syntax-types.mts';
import { chainOf } from '../model/traversal.mts';
import { unsupported } from '../mutation/mutation.mts';
import { declarationOf, locationOf } from './program.mts';
import { moduleBinding } from './module-bindings.mts';
import { calleeText } from './render.mts';

const COMPARISONS = new Map<ts.SyntaxKind, ComparisonOperator>([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, '==='],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!=='],
  [ts.SyntaxKind.EqualsEqualsToken, '=='],
  [ts.SyntaxKind.ExclamationEqualsToken, '!='],
  [ts.SyntaxKind.LessThanToken, '<'],
  [ts.SyntaxKind.LessThanEqualsToken, '<='],
  [ts.SyntaxKind.GreaterThanToken, '>'],
  [ts.SyntaxKind.GreaterThanEqualsToken, '>='],
]);

const LOGICAL = new Map<ts.SyntaxKind, 'and' | 'or'>([
  [ts.SyntaxKind.AmpersandAmpersandToken, 'and'],
  [ts.SyntaxKind.BarBarToken, 'or'],
]);

const BOOLEAN_KEYWORDS = new Map<ts.SyntaxKind, boolean>([
  [ts.SyntaxKind.TrueKeyword, true],
  [ts.SyntaxKind.FalseKeyword, false],
]);

function transparentInner(node: ts.Node): ts.Node | undefined {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return node.expression;
  }
  return undefined;
}

export function unwrap(node: ts.Node): ts.Node {
  return chainOf<ts.Node>(node, transparentInner).at(-1) ?? node;
}

function literalExpr(node: ts.Node): Expr | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'lit', value: node.text };
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: 'lit', value: Number(node.text) };
  }
  const keyword = BOOLEAN_KEYWORDS.get(node.kind);
  return keyword === undefined ? undefined : { kind: 'lit', value: keyword };
}

function identifierExpr(node: ts.Identifier, cx: ExtractContext): Expr {
  const declaration = declarationOf(cx.checker, node);
  if (declaration === undefined) {
    return node.text === 'undefined' ? { kind: 'undefined' } : { kind: 'global', name: node.text };
  }
  return (
    cx.params.get(declaration) ?? cx.locals.get(declaration) ?? moduleBinding(declaration, node, cx)
  );
}

function memberLiteral(object: Expr, field: string): LitValue | undefined {
  if (object.kind !== 'module' || object.members === undefined) {
    return undefined;
  }
  return Object.hasOwn(object.members, field) ? object.members[field] : undefined;
}

function propertyExpr(node: ts.PropertyAccessExpression, cx: ExtractContext): Expr {
  const object = toExpr(node.expression, cx);
  const field = node.name.text;
  const value = memberLiteral(object, field);
  if (object.kind === 'module' && value !== undefined) {
    return { kind: 'lit', value, via: `${object.name}.${field}` };
  }
  return { kind: 'get', object, field, loc: locationOf(cx.sourceFile, node) };
}

function elementExpr(node: ts.ElementAccessExpression, cx: ExtractContext): Expr {
  const argument = unwrap(node.argumentExpression);
  if (!ts.isStringLiteral(argument)) {
    return unsupported(node, cx, 'computed-access');
  }
  const object = toExpr(node.expression, cx);
  return { kind: 'get', object, field: argument.text, loc: locationOf(cx.sourceFile, node) };
}

function calleeOf(node: ts.Node, cx: ExtractContext): Callee {
  const target = unwrap(node);
  if (ts.isIdentifier(target)) {
    const resolved = identifierExpr(target, cx);
    if (resolved.kind === 'helper') {
      cx.helpers.add(resolved.name);
    }
    if (resolved.kind === 'helper' || resolved.kind === 'import' || resolved.kind === 'global') {
      return resolved;
    }
    return { kind: 'dynamic', syntax: `${resolved.kind}-value` };
  }
  if (!ts.isPropertyAccessExpression(target)) {
    return { kind: 'dynamic', syntax: ts.SyntaxKind[target.kind] ?? '' };
  }
  const receiver = toExpr(target.expression, cx);
  if (receiver.kind === 'import' && receiver.name === '*') {
    return { kind: 'import', module: receiver.module, name: target.name.text };
  }
  return { kind: 'member', receiver, method: target.name.text };
}

function argumentsOf(node: ts.CallExpression | ts.NewExpression, cx: ExtractContext): Expr[] {
  return (node.arguments ?? []).map((argument) =>
    ts.isSpreadElement(argument) ? unsupported(argument, cx, 'spread') : toExpr(argument, cx),
  );
}

function nextSite(cx: ExtractContext, callee: Callee): string {
  const text = calleeText(callee);
  const count = (cx.sites.get(text) ?? 0) + 1;
  cx.sites.set(text, count);
  return `${cx.fnName}:${text}#${String(count)}`;
}

function callExpr(node: ts.CallExpression, cx: ExtractContext): Expr {
  const callee = calleeOf(node.expression, cx);
  const site = nextSite(cx, callee);
  return {
    kind: 'call',
    callee,
    site,
    args: argumentsOf(node, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}

function newExpr(node: ts.NewExpression, cx: ExtractContext): Expr {
  const target = unwrap(node.expression);
  const identifier = ts.isIdentifier(target) ? target : undefined;
  const name = identifier === undefined ? '<dynamic>' : identifier.text;
  const global = identifier !== undefined && declarationOf(cx.checker, identifier) === undefined;
  const loc = locationOf(cx.sourceFile, node);
  return { kind: 'new', name, global, args: argumentsOf(node, cx), loc };
}

function operandsOf(node: ts.BinaryExpression, cx: ExtractContext) {
  const left = toExpr(node.left, cx);
  const right = toExpr(node.right, cx);
  return { left, right, loc: locationOf(cx.sourceFile, node) };
}

function binaryExpr(node: ts.BinaryExpression, cx: ExtractContext): Expr {
  const operator = node.operatorToken.kind;
  const op = COMPARISONS.get(operator);
  if (op !== undefined) {
    return { kind: 'cmp', op, ...operandsOf(node, cx) };
  }
  const logical = LOGICAL.get(operator);
  if (logical === undefined) {
    return unsupported(node, cx, `operator ${node.operatorToken.getText()}`);
  }
  return { kind: logical, ...operandsOf(node, cx) };
}

function prefixExpr(node: ts.PrefixUnaryExpression, cx: ExtractContext): Expr {
  if (node.operator !== ts.SyntaxKind.ExclamationToken) {
    return unsupported(node, cx, 'prefix-operator');
  }
  return { kind: 'not', operand: toExpr(node.operand, cx), loc: locationOf(cx.sourceFile, node) };
}

function conditionalExpr(node: ts.ConditionalExpression, cx: ExtractContext): Expr {
  const test = toExpr(node.condition, cx);
  const then = toExpr(node.whenTrue, cx);
  return {
    kind: 'cond',
    test,
    then,
    else: toExpr(node.whenFalse, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}

function objectField(
  property: ts.ObjectLiteralElementLike,
  cx: ExtractContext,
): readonly [string, Expr] | undefined {
  if (ts.isShorthandPropertyAssignment(property)) {
    return [property.name.text, identifierExpr(property.name, cx)];
  }
  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }
  const { name } = property;
  const named = (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text !== '__proto__';
  return named ? [name.text, toExpr(property.initializer, cx)] : undefined;
}

function objectExpr(node: ts.ObjectLiteralExpression, cx: ExtractContext): Expr {
  const fields = node.properties.map((property) => objectField(property, cx));
  const complete = fields.filter((field) => field !== undefined);
  if (complete.length !== fields.length) {
    return unsupported(node, cx, 'object-member');
  }
  return { kind: 'object', fields: complete };
}

function templateExpr(node: ts.TemplateExpression, cx: ExtractContext): Expr {
  const parts: (string | Expr)[] = [node.head.text];
  for (const span of node.templateSpans) {
    parts.push(toExpr(span.expression, cx), span.literal.text);
  }
  return { kind: 'template', parts: parts.filter((part) => part !== '') };
}

function builtExpr(node: ts.Node, cx: ExtractContext): Expr {
  if (ts.isOptionalChain(node)) {
    return unsupported(node, cx, 'optional-chain');
  }
  if (ts.isIdentifier(node)) {
    return identifierExpr(node, cx);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return propertyExpr(node, cx);
  }
  if (ts.isElementAccessExpression(node)) {
    return elementExpr(node, cx);
  }
  if (ts.isCallExpression(node)) {
    return callExpr(node, cx);
  }
  if (ts.isNewExpression(node)) {
    return newExpr(node, cx);
  }
  if (ts.isBinaryExpression(node)) {
    return binaryExpr(node, cx);
  }
  if (ts.isPrefixUnaryExpression(node)) {
    return prefixExpr(node, cx);
  }
  if (ts.isConditionalExpression(node)) {
    return conditionalExpr(node, cx);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return objectExpr(node, cx);
  }
  if (ts.isTemplateExpression(node)) {
    return templateExpr(node, cx);
  }
  return unsupported(node, cx);
}

export function toExpr(input: ts.Node, cx: ExtractContext): Expr {
  const node = unwrap(input);
  return literalExpr(node) ?? builtExpr(node, cx);
}
