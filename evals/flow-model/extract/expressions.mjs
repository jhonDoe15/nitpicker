import ts from 'typescript';
import { chainOf, depthFirst } from '../../../shared/traversal.mjs';
import { declarationOf, locationOf } from './program.mjs';
import { moduleBinding } from './module-bindings.mjs';
import { calleeText } from './render.mjs';

const COMPARISONS = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, '==='],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!=='],
  [ts.SyntaxKind.EqualsEqualsToken, '=='],
  [ts.SyntaxKind.ExclamationEqualsToken, '!='],
  [ts.SyntaxKind.LessThanToken, '<'],
  [ts.SyntaxKind.LessThanEqualsToken, '<='],
  [ts.SyntaxKind.GreaterThanToken, '>'],
  [ts.SyntaxKind.GreaterThanEqualsToken, '>='],
]);

const LOGICAL = new Map([
  [ts.SyntaxKind.AmpersandAmpersandToken, 'and'],
  [ts.SyntaxKind.BarBarToken, 'or'],
]);

const TRANSPARENT = [
  ts.isParenthesizedExpression,
  ts.isAsExpression,
  ts.isSatisfiesExpression,
  ts.isNonNullExpression,
];

const STEPS = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

function transparentInner(node) {
  return TRANSPARENT.some((test) => test(node)) ? node.expression : undefined;
}

export function unwrap(node) {
  return chainOf(node, transparentInner).at(-1);
}

function childrenOf(node) {
  return node.getChildren();
}

function isCall(node) {
  return (
    ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)
  );
}

function isAssignment(node) {
  return ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind);
}

function isMutation(node) {
  const steps =
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    STEPS.has(node.operator);
  return isAssignment(node) || steps || ts.isDeleteExpression(node);
}

function targetsOf(node) {
  if (isAssignment(node)) {
    return [...depthFirst(node.left, childrenOf)].filter((item) => ts.isIdentifier(item));
  }
  const operand = ts.isDeleteExpression(node) ? node.expression : node.operand;
  return ts.isIdentifier(operand) ? [operand] : [];
}

function clobberOf(identifier, cx) {
  const declaration = declarationOf(cx.checker, identifier);
  const param = cx.params.get(declaration);
  if (param?.kind === 'param') {
    return `param:${String(param.index)}`;
  }
  const local = cx.locals.get(declaration);
  return local === undefined ? undefined : `local:${local.id}`;
}

export function effectsOf(node, cx) {
  const nodes = [...depthFirst(node, childrenOf)];
  const mutations = nodes.filter(isMutation);
  const clobbers = mutations.flatMap(targetsOf).map((identifier) => clobberOf(identifier, cx));
  return {
    hasCall: nodes.some(isCall),
    mutates: mutations.length > 0,
    clobbers: [...new Set(clobbers.filter((item) => item !== undefined))].sort(),
  };
}

export function unsupported(node, cx, syntax = ts.SyntaxKind[node.kind]) {
  return {
    kind: 'unsupported',
    syntax,
    ...effectsOf(node, cx),
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
  ]);
  return keywords.has(node.kind) ? { kind: 'lit', value: keywords.get(node.kind) } : undefined;
}

function identifierExpr(node, cx) {
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
  if (
    object.kind === 'module' &&
    object.members !== undefined &&
    Object.hasOwn(object.members, field)
  ) {
    return { kind: 'lit', value: object.members[field], via: `${object.name}.${field}` };
  }
  return { kind: 'get', object, field, loc: locationOf(cx.sourceFile, node) };
}

function elementExpr(node, cx) {
  const argument = unwrap(node.argumentExpression);
  if (!ts.isStringLiteral(argument)) {
    return unsupported(node, cx, 'computed-access');
  }
  const object = toExpr(node.expression, cx);
  return { kind: 'get', object, field: argument.text, loc: locationOf(cx.sourceFile, node) };
}

function calleeOf(node, cx) {
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

function nextSite(cx, callee) {
  const text = calleeText(callee);
  const count = (cx.sites.get(text) ?? 0) + 1;
  cx.sites.set(text, count);
  return `${cx.fnName}:${text}#${String(count)}`;
}

function callExpr(node, cx) {
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

function newExpr(node, cx) {
  const target = unwrap(node.expression);
  const name = ts.isIdentifier(target) ? target.text : '<dynamic>';
  return { kind: 'new', name, args: argumentsOf(node, cx), loc: locationOf(cx.sourceFile, node) };
}

function binaryExpr(node, cx) {
  const operator = node.operatorToken.kind;
  const shape = COMPARISONS.has(operator)
    ? { kind: 'cmp', op: COMPARISONS.get(operator) }
    : { kind: LOGICAL.get(operator) };
  if (shape.kind === undefined) {
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
  [ts.isOptionalChain, (node, cx) => unsupported(node, cx, 'optional-chain')],
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
