import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, resolveConstant } from '../../analysis/constant-resolution.mts';
import { memberName, type Context } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import { descendants, skipped } from '../io-origin.mts';

type MaybeNode = TSESTree.Node | undefined;
type Step = boolean | { readonly next: readonly MaybeNode[] };

const { DefinitionType } = TSESLint.Scope;

const CHUNKERS = new Set([
  'chunk',
  'chunked',
  'chunks',
  'splitEvery',
  'cluster',
  'batch',
  'batches',
  'inGroupsOf',
]);
const KEEPS_SIZE = new Set([
  'filter',
  'map',
  'sort',
  'toSorted',
  'reverse',
  'toReversed',
  'flat',
  'fill',
  'keys',
]);
const OBJECT_VIEWS = new Set(['keys', 'values', 'entries']);
const SIZES = new Set(['length', 'size']);
const ARRAY = 'Array';
const MAX_DEPTH = 6;

function numericParts(target: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  if (target.type === AST_NODE_TYPES.Literal) {
    return typeof target.value === 'number' ? [] : undefined;
  }
  if (target.type === AST_NODE_TYPES.UnaryExpression) {
    return [target.argument];
  }
  return target.type === AST_NODE_TYPES.BinaryExpression ? [target.left, target.right] : undefined;
}

function numeric(context: Context, node: TSESTree.Node): boolean {
  const pending: { node: MaybeNode; depth: number }[] = [{ node, depth: 0 }];
  for (const entry of pending) {
    const target = resolveConstant(context, skipped(entry.node));
    const parts =
      target === undefined || entry.depth > MAX_DEPTH ? undefined : numericParts(target);
    if (parts === undefined) {
      return false;
    }
    pending.push(...parts.map((part) => ({ node: part, depth: entry.depth + 1 })));
  }
  return true;
}

function explicitSize(node: TSESTree.Node): boolean {
  return ![...descendants(node)].some(
    (child) => child.type === AST_NODE_TYPES.MemberExpression && SIZES.has(memberName(child) ?? ''),
  );
}

function resolvedValue(context: Context, node: MaybeNode): MaybeNode {
  const seen = [skipped(node)];
  for (const current of seen) {
    const next = skipped(resolveConstant(context, current));
    if (next === current || next === undefined || seen.length >= MAX_DEPTH) {
      return next;
    }
    seen.push(next);
  }
  return undefined;
}

function isEnum(context: Context, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  return definition?.type === DefinitionType.TSEnumName;
}

function sizedWindow(context: Context, call: TSESTree.CallExpression): boolean {
  const [first, second] = call.arguments;
  if (
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(call.callee) === 'slice' &&
    second === undefined
  ) {
    return first !== undefined && numeric(context, first);
  }
  return second !== undefined && explicitSize(second);
}

function isLengthProperty(property: TSESTree.Node): property is TSESTree.Property {
  return property.type === AST_NODE_TYPES.Property && nameOf(property.key) === 'length';
}

function sizedByLength(context: Context, node: MaybeNode): boolean {
  const object = skipped(node);
  const length =
    object?.type === AST_NODE_TYPES.ObjectExpression
      ? object.properties.find(isLengthProperty)
      : undefined;
  const value = length === undefined ? undefined : resolvedValue(context, length.value);
  return value !== undefined && explicitSize(value);
}

function countOf(context: Context, node: MaybeNode): boolean {
  const value = node === undefined ? undefined : resolvedValue(context, node);
  return value !== undefined && explicitSize(value);
}

function chunkerName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

function isChunkCall(context: Context, node: TSESTree.Node): boolean {
  const target = resolveConstant(context, skipped(node));
  if (target?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const [, size] = target.arguments;
  return CHUNKERS.has(chunkerName(target) ?? '') && size !== undefined && explicitSize(size);
}

function isChunkVariable(context: Context, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const loop =
    definition?.type === DefinitionType.Variable ? definition.node.parent.parent : undefined;
  return loop?.type === AST_NODE_TYPES.ForOfStatement && isChunkCall(context, loop.right);
}

function fixedCall(context: Context, call: TSESTree.CallExpression): Step {
  const name =
    call.callee.type === AST_NODE_TYPES.MemberExpression
      ? memberName(call.callee)
      : nameOf(call.callee);
  const owner =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? skipped(call.callee.object) : undefined;
  if (['slice', 'splice'].includes(name ?? '')) {
    return sizedWindow(context, call);
  }
  if (nameOf(owner) === 'Object' && OBJECT_VIEWS.has(name ?? '')) {
    return { next: [call.arguments[0]] };
  }
  if (nameOf(owner) === ARRAY && name === 'from') {
    return sizedByLength(context, call.arguments[0]);
  }
  if (name === ARRAY && call.arguments.length === 1) {
    return countOf(context, call.arguments[0]);
  }
  return KEEPS_SIZE.has(name ?? '') && owner !== undefined ? { next: [owner] } : false;
}

function arrayStep(target: TSESTree.ArrayExpression): Step {
  if (target.elements.length === 0 || target.elements.some((element) => element === null)) {
    return false;
  }
  const spreads = target.elements
    .filter(
      (element): element is TSESTree.SpreadElement =>
        element?.type === AST_NODE_TYPES.SpreadElement,
    )
    .map((element) => element.argument);
  return spreads.length === 0 || { next: spreads };
}

function fixedStep(context: Context, target: TSESTree.Node): Step {
  if (target.type === AST_NODE_TYPES.ArrayExpression) {
    return arrayStep(target);
  }
  if (target.type === AST_NODE_TYPES.ObjectExpression) {
    return (
      target.properties.length > 0 &&
      target.properties.every((property) => property.type === AST_NODE_TYPES.Property)
    );
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return fixedCall(context, target);
  }
  if (target.type === AST_NODE_TYPES.NewExpression) {
    return (
      nameOf(target.callee) === ARRAY &&
      target.arguments.length === 1 &&
      countOf(context, target.arguments[0])
    );
  }
  return (
    target.type === AST_NODE_TYPES.Identifier &&
    (isEnum(context, target) || isChunkVariable(context, target))
  );
}

export function isFixedCollection(context: Context, node: TSESTree.Node, start = 0): boolean {
  const pending: { node: MaybeNode; depth: number }[] = [{ node, depth: start }];
  for (const entry of pending) {
    const target = resolvedValue(context, entry.node);
    const step: Step =
      target === undefined || entry.depth > MAX_DEPTH ? false : fixedStep(context, target);
    if (step === false) {
      return false;
    }
    if (step !== true) {
      pending.push(...step.next.map((next) => ({ node: next, depth: entry.depth + 1 })));
    }
  }
  return true;
}
