import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { calleeNameOf, outermostOf, unwrapOf, unwrapped } from '../../typed/syntax-views.mts';
import { EXPRESSION_WRAPPERS, singleWriteInitializer } from './readdir-sources.mts';

export type EntryMatcher =
  | { readonly kind: 'variable'; readonly variable: TSESLint.Scope.Variable }
  | {
      readonly kind: 'indexed';
      readonly collection: TSESLint.Scope.Variable;
      readonly index: TSESLint.Scope.Variable;
    };

const STAT_CALLS = new Set(['stat', 'lstat', 'statSync', 'lstatSync']);
const PATH_BUILDERS = new Set(['join', 'resolve']);
const DIRENT_METHODS = new Set(['isDirectory', 'isFile', 'isSymbolicLink']);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const MAX_PATH_DEPTH = 8;

const VALUE_WRAPPERS = [
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
];

const READ_WRAPPERS = [
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
];

export function statCallName(call: TSESTree.CallExpression): string | undefined {
  const name = calleeNameOf(unwrapped(call.callee));
  return name !== undefined && STAT_CALLS.has(name) ? name : undefined;
}

function matchesIndexedEntry(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  matcher: Extract<EntryMatcher, { readonly kind: 'indexed' }>,
): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || !node.computed) {
    return false;
  }
  const object = unwrapOf(node.object, EXPRESSION_WRAPPERS);
  const property = unwrapOf(node.property, EXPRESSION_WRAPPERS);
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    property.type === AST_NODE_TYPES.Identifier &&
    variableNamed(sourceCode, object) === matcher.collection &&
    variableNamed(sourceCode, property) === matcher.index
  );
}

function matchesEntry(sourceCode: SourceCode, node: TSESTree.Node, matcher: EntryMatcher): boolean {
  if (matcher.kind === 'indexed') {
    return matchesIndexedEntry(sourceCode, node, matcher);
  }
  return (
    node.type === AST_NODE_TYPES.Identifier && variableNamed(sourceCode, node) === matcher.variable
  );
}

function nextPathCandidate(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return singleWriteInitializer(sourceCode, node);
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    return node.right;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    const trailing = node.quasis.at(-1)?.value.cooked ?? '';
    return trailing === '' ? node.expressions.at(-1) : undefined;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const builder = calleeNameOf(unwrapped(node.callee));
  return builder !== undefined && PATH_BUILDERS.has(builder) ? node.arguments.at(-1) : undefined;
}

export function isPathFromEntry(
  sourceCode: SourceCode,
  expression: TSESTree.Node | undefined,
  matcher: EntryMatcher,
): boolean {
  const pending: TSESTree.Node[] = expression === undefined ? [] : [expression];
  for (const current of pending) {
    if (pending.length > MAX_PATH_DEPTH) {
      return false;
    }
    const plain = unwrapOf(current, EXPRESSION_WRAPPERS);
    if (matchesEntry(sourceCode, plain, matcher)) {
      return true;
    }
    const next = nextPathCandidate(sourceCode, plain);
    if (next !== undefined) {
      pending.push(next);
    }
  }
  return false;
}

function isDirentMethodCall(target: TSESTree.Node): boolean {
  const member = target.parent;
  if (
    member?.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== target ||
    member.computed
  ) {
    return false;
  }
  const method = nameOf(member.property);
  const call = member.parent;
  return (
    method !== undefined &&
    DIRENT_METHODS.has(method) &&
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee === member
  );
}

function isNullishNode(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.value === null) ||
    (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined')
  );
}

function isPresenceGuard(target: TSESTree.Node): boolean {
  const parent = target.parent;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === '!') {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.BinaryExpression && EQUALITY_OPERATORS.has(parent.operator)) {
    const other = parent.left === target ? parent.right : parent.left;
    return isNullishNode(other);
  }
  return (
    (parent.type === AST_NODE_TYPES.IfStatement && parent.test === target) ||
    (parent.type === AST_NODE_TYPES.ConditionalExpression && parent.test === target) ||
    (parent.type === AST_NODE_TYPES.LogicalExpression &&
      parent.operator === '&&' &&
      parent.left === target)
  );
}

function assignedIdentifier(value: TSESTree.Node): TSESTree.Identifier | undefined {
  const holder = value.parent;
  if (
    holder?.type === AST_NODE_TYPES.VariableDeclarator &&
    holder.init === value &&
    holder.id.type === AST_NODE_TYPES.Identifier
  ) {
    return holder.id;
  }
  return holder?.type === AST_NODE_TYPES.AssignmentExpression &&
    holder.operator === '=' &&
    holder.right === value &&
    holder.left.type === AST_NODE_TYPES.Identifier
    ? holder.left
    : undefined;
}

function readTarget(reference: TSESLint.Scope.Reference): TSESTree.Node {
  return outermostOf(reference.identifier, READ_WRAPPERS);
}

function variableUsesOnlyDirentMethods(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): boolean {
  const variable = variableNamed(sourceCode, identifier);
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const reads = variable?.references.filter((reference) => reference.isRead()) ?? [];
  if (writes.length !== 1 || reads.length === 0) {
    return false;
  }
  const targets = reads.map(readTarget);
  return (
    targets.some(isDirentMethodCall) &&
    targets.every((target) => isDirentMethodCall(target) || isPresenceGuard(target))
  );
}

export function usesOnlyDirentMethods(
  sourceCode: SourceCode,
  statCall: TSESTree.CallExpression,
): boolean {
  const value = outermostOf(statCall, VALUE_WRAPPERS);
  if (isDirentMethodCall(value)) {
    return true;
  }
  const assigned = assignedIdentifier(value);
  return assigned !== undefined && variableUsesOnlyDirentMethods(sourceCode, assigned);
}
