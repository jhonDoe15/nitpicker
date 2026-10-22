import ts from 'typescript';
import { declarationOf, locationOf } from './program.mjs';
import { moduleBinding } from './module-bindings.mjs';

const BINARY = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, { kind: 'cmp', op: '===' }],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, { kind: 'cmp', op: '!==' }],
  [ts.SyntaxKind.AmpersandAmpersandToken, { kind: 'and' }],
  [ts.SyntaxKind.BarBarToken, { kind: 'or' }],
]);

const TRANSPARENT = [
  ts.isParenthesizedExpression,
  ts.isAsExpression,
  ts.isSatisfiesExpression,
  ts.isNonNullExpression,
  ts.isAwaitExpression,
];

export function unwrap(node) {
  const transparent = TRANSPARENT.some((test) => test(node));
  return transparent ? unwrap(node.expression) : node;
}

export function containsCall(node) {
  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isTaggedTemplateExpression(node)
  ) {
    return true;
  }
  return node.getChildren().some((child) => containsCall(child));
}

export function unsupported(node, cx, syntax = ts.SyntaxKind[node.kind]) {
  return {
    kind: 'unsupported',
    syntax,
    hasCall: containsCall(node),
    loc: locationOf(cx.sourceFile, node),
  };
}

function literalExpr(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: 'lit', value: node.text };
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: 'lit', value: Number(node.text) };
  }
  const keywords = new Map([
    [ts.SyntaxKind.TrueKeyword, true],
    [ts.SyntaxKind.FalseKeyword, false],
    [ts.SyntaxKind.NullKeyword, null],
  ]);
  return keywords.has(node.kind) ? { kind: 'lit', value: keywords.get(node.kind) } : undefined;
}

export function identifierExpr(node, cx) {
  const declaration = declarationOf(cx.checker, node);
  if (declaration === undefined) {
    return node.text === 'undefined' ? { kind: 'undefined' } : { kind: 'global', name: node.text };
  }
  return (
    cx.params.get(declaration) ?? cx.locals.get(declaration) ?? moduleBinding(declaration, node, cx)
  );
}

function propertyExpr(node, cx) {
  const object = toExpr(node.expression, cx);
  const field = node.name.text;
  if (object.kind === 'module' && object.members?.[field] !== undefined) {
    return { kind: 'lit', value: object.members[field], via: `${object.name}.${field}` };
  }
  return { kind: 'get', object, field };
}

function elementExpr(node, cx) {
  const argument = unwrap(node.argumentExpression);
  if (!ts.isStringLiteral(argument)) {
    return unsupported(node, cx, 'computed-access');
  }
  return { kind: 'get', object: toExpr(node.expression, cx), field: argument.text };
}

export function calleeOf(node, cx) {
  const target = unwrap(node);
  if (ts.isIdentifier(target)) {
    const resolved = identifierExpr(target, cx);
    if (resolved.kind === 'helper') {
      cx.helpers.add(resolved.name);
    }
    const named = ['helper', 'import', 'global'].includes(resolved.kind);
    return named ? resolved : { kind: 'dynamic', syntax: `${resolved.kind}-value` };
  }
  if (!ts.isPropertyAccessExpression(target)) {
    return { kind: 'dynamic', syntax: ts.SyntaxKind[target.kind] };
  }
  const receiver = toExpr(target.expression, cx);
  if (receiver.kind === 'import' && receiver.name === '*') {
    return { kind: 'import', module: receiver.module, name: target.name.text };
  }
  return { kind: 'member', receiver, method: target.name.text };
}

function argumentsOf(node, cx) {
  return (node.arguments ?? []).map((argument) =>
    ts.isSpreadElement(argument) ? unsupported(argument, cx, 'spread') : toExpr(argument, cx),
  );
}

function callExpr(node, cx) {
  const callee = calleeOf(node.expression, cx);
  return {
    kind: 'call',
    callee,
    args: argumentsOf(node, cx),
    loc: locationOf(cx.sourceFile, node),
  };
}

function newExpr(node, cx) {
  const target = unwrap(node.expression);
  const name = ts.isIdentifier(target) ? target.text : '<dynamic>';
  return { kind: 'new', name, args: argumentsOf(node, cx), loc: locationOf(cx.sourceFile, node) };
}

function binaryExpr(node, cx) {
  const shape = BINARY.get(node.operatorToken.kind);
  if (shape === undefined) {
    return unsupported(node, cx, `operator ${node.operatorToken.getText()}`);
  }
  const left = toExpr(node.left, cx);
  const right = toExpr(node.right, cx);
  return { ...shape, left, right, loc: locationOf(cx.sourceFile, node) };
}

function prefixExpr(node, cx) {
  if (node.operator !== ts.SyntaxKind.ExclamationToken) {
    return unsupported(node, cx, 'prefix-operator');
  }
  return { kind: 'not', operand: toExpr(node.operand, cx), loc: locationOf(cx.sourceFile, node) };
}

function conditionalExpr(node, cx) {
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

function objectField(property, cx) {
  if (ts.isShorthandPropertyAssignment(property)) {
    return [property.name.text, identifierExpr(property.name, cx)];
  }
  const named =
    ts.isPropertyAssignment(property) &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
  return named ? [property.name.text, toExpr(property.initializer, cx)] : undefined;
}

function objectExpr(node, cx) {
  const fields = node.properties.map((property) => objectField(property, cx));
  if (fields.includes(undefined)) {
    return unsupported(node, cx, 'object-member');
  }
  return { kind: 'object', fields };
}

function templateExpr(node, cx) {
  const parts = [node.head.text];
  for (const span of node.templateSpans) {
    parts.push(toExpr(span.expression, cx), span.literal.text);
  }
  return { kind: 'template', parts: parts.filter((part) => part !== '') };
}

const BUILDERS = [
  [ts.isIdentifier, identifierExpr],
  [ts.isPropertyAccessExpression, propertyExpr],
  [ts.isElementAccessExpression, elementExpr],
  [ts.isCallExpression, callExpr],
  [ts.isNewExpression, newExpr],
  [ts.isBinaryExpression, binaryExpr],
  [ts.isPrefixUnaryExpression, prefixExpr],
  [ts.isConditionalExpression, conditionalExpr],
  [ts.isObjectLiteralExpression, objectExpr],
  [ts.isTemplateExpression, templateExpr],
];

export function toExpr(input, cx) {
  const node = unwrap(input);
  const literal = literalExpr(node);
  if (literal !== undefined) {
    return literal;
  }
  const builder = BUILDERS.find(([test]) => test(node));
  return builder === undefined ? unsupported(node, cx) : builder[1](node, cx);
}
