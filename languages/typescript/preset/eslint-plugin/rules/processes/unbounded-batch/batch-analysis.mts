import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../analysis/constant-resolution.mts';
import { memberName, numberValue } from '../../collections/costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  constantInitializer,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import {
  bindingName,
  calleeIdentifierOrMember,
  wordsOf,
} from '../support/process-command-helpers.mts';

const COLLECTION_WORDS = new Set([
  'file',
  'files',
  'entry',
  'entries',
  'source',
  'sources',
  'path',
  'paths',
  'target',
  'targets',
  'module',
  'modules',
  'item',
  'items',
  'finding',
  'findings',
  'result',
  'results',
  'document',
  'documents',
  'record',
  'records',
  'input',
  'inputs',
  'candidate',
  'candidates',
]);
const FIXED_OPTION_WORDS = new Set([
  'arg',
  'args',
  'flag',
  'flags',
  'option',
  'options',
  'opt',
  'opts',
  'param',
  'params',
  'switch',
  'switches',
  'argv',
  'config',
  'default',
  'defaults',
]);
const WALK_CALL_PATTERN = /(?:walk|glob|readdir|findfiles|listfiles|collectfiles|discover|scan)/iu;
const BATCH_NAME_PATTERN =
  /(?:batch|batches|chunk|chunks|slice|slices|partition|paginate|window|group)/iu;
const TRANSFORM_METHODS = new Set(['map', 'filter', 'flatMap', 'sort', 'toSorted', 'concat']);

function isFixedLiteralArray(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.every((el) => el === null || el.type !== AST_NODE_TYPES.SpreadElement);
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    const init = constantInitializer(sourceCode, value);
    return init !== undefined && isFixedLiteralArray(sourceCode, init);
  }
  return false;
}

function isBoundedSliceCall(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.CallExpression || calleeIdentifierOrMember(value) !== 'slice') {
    return false;
  }
  return value.arguments.length >= 2 || (numberValue(value.arguments[0]) ?? 0) < 0;
}

function declaratorInit(
  sourceCode: SourceCode,
  id: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const def = variableNamed(sourceCode, id)?.defs[0];
  return def?.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init !== null
    ? def.node.init
    : undefined;
}

function isWalkExpression(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isWalkExpression(value.argument);
  }
  const name =
    value.type === AST_NODE_TYPES.CallExpression ? calleeIdentifierOrMember(value) : undefined;
  return name !== undefined && WALK_CALL_PATTERN.test(name);
}

function unwrapCollectionSource(node: TSESTree.Node): TSESTree.Node {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return value;
  }
  const callee = unwrapped(value.callee);
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    TRANSFORM_METHODS.has(memberName(callee) ?? '')
  ) {
    return unwrapCollectionSource(callee.object);
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Array' &&
    memberName(callee) === 'from' &&
    value.arguments[0] !== undefined
  ) {
    return unwrapCollectionSource(value.arguments[0]);
  }
  return value;
}

function isFixedOptionName(name: string): boolean {
  const words = wordsOf(name);
  return (
    words.some((word) => FIXED_OPTION_WORDS.has(word)) &&
    !words.some((word) => COLLECTION_WORDS.has(word))
  );
}

export function isUnboundedCollectionSpread(
  sourceCode: SourceCode,
  spreadArg: TSESTree.Node,
): boolean {
  if (isFixedLiteralArray(sourceCode, spreadArg) || isBoundedSliceCall(spreadArg)) {
    return false;
  }
  const source = unwrapCollectionSource(spreadArg);
  const init =
    source.type === AST_NODE_TYPES.Identifier ? declaratorInit(sourceCode, source) : undefined;
  if (init !== undefined && (isBoundedSliceCall(init) || isFixedLiteralArray(sourceCode, init))) {
    return false;
  }
  if (isWalkExpression(source) || (init !== undefined && isWalkExpression(init))) {
    return true;
  }
  const name = bindingName(unwrapped(source));
  return (
    name !== undefined &&
    !isFixedOptionName(name) &&
    wordsOf(name).some((w) => COLLECTION_WORDS.has(w))
  );
}

function isBatchForOf(node: TSESTree.ForOfStatement): boolean {
  if (node.left.type === AST_NODE_TYPES.VariableDeclaration) {
    const id = node.left.declarations[0]?.id;
    if (id?.type === AST_NODE_TYPES.Identifier && BATCH_NAME_PATTERN.test(id.name)) {
      return true;
    }
  }
  const right = unwrapped(node.right);
  const rightName =
    right.type === AST_NODE_TYPES.CallExpression
      ? calleeIdentifierOrMember(right)
      : bindingName(right);
  return rightName !== undefined && BATCH_NAME_PATTERN.test(rightName);
}

function isSteppedForLoop(node: TSESTree.ForStatement): boolean {
  return (
    node.update?.type === AST_NODE_TYPES.AssignmentExpression &&
    (node.update.operator === '+=' || node.update.operator === '-=')
  );
}

function isBatchCallback(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    node.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }
  const firstParam = node.params[0];
  if (firstParam?.type === AST_NODE_TYPES.Identifier && BATCH_NAME_PATTERN.test(firstParam.name)) {
    return true;
  }
  const parent = node.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(parent.callee);
  const receiver =
    callee.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
  const receiverName =
    receiver?.type === AST_NODE_TYPES.CallExpression
      ? calleeIdentifierOrMember(receiver)
      : bindingName(receiver);
  return receiverName !== undefined && BATCH_NAME_PATTERN.test(receiverName);
}

export function isInsideBatchLoop(node: TSESTree.Node): boolean {
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor.type === AST_NODE_TYPES.ForOfStatement && isBatchForOf(ancestor)) {
      return true;
    }
    if (ancestor.type === AST_NODE_TYPES.ForStatement && isSteppedForLoop(ancestor)) {
      return true;
    }
    if (isBatchCallback(ancestor)) {
      return true;
    }
  }
  return false;
}

export function resolveArgsArray(
  context: SourceContext,
  argsNode: TSESTree.Node | undefined,
): TSESTree.ArrayExpression | undefined {
  const resolved = resolveConstant(context, argsNode);
  return resolved?.type === AST_NODE_TYPES.ArrayExpression ? resolved : undefined;
}
