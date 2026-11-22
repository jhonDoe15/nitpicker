import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { isStaticMethodCall } from '../support/ast-walk.mts';
import { innermostRepeat } from '../support/loop-invariance.mts';

const { DefinitionType } = TSESLint.Scope;

const READ_SOURCES = new Set(['readFileSync', 'readFile']);
const TRANSFORM_METHODS = new Set(['map', 'filter', 'flatMap', 'sort', 'toSorted', 'concat']);
const PUSH_METHODS = new Set(['push', 'unshift']);
const UNBOUNDED_LIST_NAMES = new Set([
  'findings',
  'results',
  'files',
  'rows',
  'entries',
  'records',
  'items',
  'lines',
  'events',
  'violations',
  'diagnostics',
]);
const FIXED_SHAPE_NAMES = new Set([
  'summary',
  'config',
  'options',
  'manifest',
  'meta',
  'header',
  'status',
]);
const SMALL_LITERAL_LIMIT = 20;

export function matchesListName(text: string): boolean {
  const tokens = text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
  if (tokens.some((token) => FIXED_SHAPE_NAMES.has(token))) {
    return false;
  }
  return tokens.some((token) => UNBOUNDED_LIST_NAMES.has(token));
}

export function isCallNamed(node: TSESTree.CallExpression, names: ReadonlySet<string>): boolean {
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return names.has(callee.name);
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const name = memberName(callee);
    return name !== undefined && names.has(name);
  }
  return false;
}

export function isJsonCall(node: TSESTree.CallExpression, method: 'stringify' | 'parse'): boolean {
  return isStaticMethodCall(node, 'JSON', method);
}

function constInitOf(
  sourceCode: SourceCode,
  id: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const defs = variableNamed(sourceCode, id)?.defs;
  if (defs === undefined || defs.length !== 1) {
    return undefined;
  }
  const [def] = defs;
  if (def?.type !== DefinitionType.Variable || def.parent.kind !== 'const') {
    return undefined;
  }
  return def.node.id.type === AST_NODE_TYPES.Identifier ? (def.node.init ?? undefined) : undefined;
}

function isBoundedSlice(node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  if (expr.type !== AST_NODE_TYPES.CallExpression || expr.arguments.length < 2) {
    return false;
  }
  const callee = unwrapped(expr.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression && memberName(callee) === 'slice';
}

function isSmallArrayLiteral(node: TSESTree.Node): boolean {
  const expr = unwrapped(node);
  return (
    expr.type === AST_NODE_TYPES.ArrayExpression &&
    expr.elements.length <= SMALL_LITERAL_LIMIT &&
    expr.elements.every((element) => element?.type !== AST_NODE_TYPES.SpreadElement)
  );
}

function isLoopBuiltVariable(sourceCode: SourceCode, id: TSESTree.Identifier): boolean {
  const variable = variableNamed(sourceCode, id);
  if (variable === undefined) {
    return false;
  }
  return variable.references.some((reference) => {
    const parent = reference.identifier.parent;
    const isPush =
      parent.type === AST_NODE_TYPES.MemberExpression &&
      parent.object === reference.identifier &&
      PUSH_METHODS.has(memberName(parent) ?? '') &&
      parent.parent.type === AST_NODE_TYPES.CallExpression &&
      parent.parent.callee === parent;
    return isPush && innermostRepeat(reference.identifier) !== undefined;
  });
}

function unwrapTransformChain(node: TSESTree.Node): TSESTree.Node {
  let current = unwrapped(node);
  while (current.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped(current.callee);
    if (
      callee.type !== AST_NODE_TYPES.MemberExpression ||
      !TRANSFORM_METHODS.has(memberName(callee) ?? '')
    ) {
      break;
    }
    current = unwrapped(callee.object);
  }
  return current;
}

function isUnboundedIdentifier(sourceCode: SourceCode, id: TSESTree.Identifier): boolean {
  if (isLoopBuiltVariable(sourceCode, id)) {
    return true;
  }
  const init = constInitOf(sourceCode, id);
  if (init !== undefined && (isBoundedSlice(init) || isSmallArrayLiteral(init))) {
    return false;
  }
  return matchesListName(id.name);
}

function isUnboundedValue(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const expr = unwrapTransformChain(node);
  if (isBoundedSlice(expr) || isSmallArrayLiteral(expr)) {
    return false;
  }
  if (expr.type === AST_NODE_TYPES.Identifier) {
    return isUnboundedIdentifier(sourceCode, expr);
  }
  if (expr.type === AST_NODE_TYPES.MemberExpression) {
    const name = memberName(expr);
    return name !== undefined && matchesListName(name);
  }
  return false;
}

function isUnboundedProperty(
  sourceCode: SourceCode,
  property: TSESTree.ObjectLiteralElement,
): boolean {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    return isUnboundedValue(sourceCode, property.argument);
  }
  if (isBoundedSlice(property.value) || isSmallArrayLiteral(property.value)) {
    return false;
  }
  if (isUnboundedValue(sourceCode, property.value)) {
    return true;
  }
  const key = property.key;
  const keyName =
    key.type === AST_NODE_TYPES.Identifier && !property.computed ? key.name : stringValue(key);
  return keyName !== undefined && matchesListName(keyName);
}

export function isUnboundedList(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const expr = unwrapTransformChain(node);
  if (expr.type === AST_NODE_TYPES.ObjectExpression) {
    return expr.properties.some((property) => isUnboundedProperty(sourceCode, property));
  }
  return isUnboundedValue(sourceCode, expr);
}

function expandSerializedNode(
  sourceCode: SourceCode,
  expr: TSESTree.Node,
): TSESTree.Node[] | undefined {
  if (expr.type === AST_NODE_TYPES.TemplateLiteral) {
    return [...expr.expressions];
  }
  if (expr.type === AST_NODE_TYPES.BinaryExpression && expr.operator === '+') {
    return [expr.left, expr.right];
  }
  if (expr.type === AST_NODE_TYPES.Identifier) {
    const init = constInitOf(sourceCode, expr);
    return init === undefined ? undefined : [init];
  }
  return undefined;
}

export function extractSerializedParts(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): TSESTree.Node[] {
  const pending: TSESTree.Node[] = [node];
  const parts: TSESTree.Node[] = [];
  const seen = new Set<TSESTree.Node>();
  for (const current of pending) {
    const expr = unwrapped(current);
    if (seen.has(expr)) {
      continue;
    }
    seen.add(expr);
    const expanded = expandSerializedNode(sourceCode, expr);
    if (expanded !== undefined) {
      pending.push(...expanded);
    } else {
      parts.push(expr);
    }
  }
  return parts;
}

function stepReadSource(sourceCode: SourceCode, expr: TSESTree.Node): TSESTree.Node | undefined {
  if (expr.type === AST_NODE_TYPES.AwaitExpression) {
    return expr.argument;
  }
  return expr.type === AST_NODE_TYPES.Identifier ? constInitOf(sourceCode, expr) : undefined;
}

export function readSourceCallOf(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
): TSESTree.CallExpression | undefined {
  const seen = new Set<TSESTree.Node>();
  let current = node;
  while (current !== undefined) {
    const expr = unwrapped(current);
    if (seen.has(expr)) {
      return undefined;
    }
    seen.add(expr);
    if (expr.type === AST_NODE_TYPES.CallExpression && isCallNamed(expr, READ_SOURCES)) {
      return expr;
    }
    current = stepReadSource(sourceCode, expr);
  }
  return undefined;
}
