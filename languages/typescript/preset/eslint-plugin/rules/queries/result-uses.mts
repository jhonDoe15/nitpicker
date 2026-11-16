import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import { outermostOf, TYPE_WRAPPERS } from '../typed/syntax-views.mts';
import { readsOnlyFields } from './row-callbacks.mts';
import { libraryBinding, variableOf } from '../persistence/library-bindings.mts';

export const COUNT = 'count';
export const FILTER = 'filter';
export const SORT = 'sort';
export const AGGREGATE = 'aggregate';

type Shape = typeof COUNT | typeof FILTER | typeof SORT | typeof AGGREGATE;
export type Use = { readonly node: TSESTree.Node; readonly shape: Shape };
type MaybeNode = TSESTree.Node | undefined;

const FILTER_METHODS = new Set<string | undefined>([
  'filter',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
]);
const SORT_METHODS = new Set<string | undefined>(['sort', 'toSorted']);
const REDUCE_METHODS = new Set<string | undefined>(['reduce', 'reduceRight']);
const EXTREMES = new Set<string | undefined>(['max', 'min']);
const GROUP_OWNERS = new Set<string>(['Object', 'Map']);
const GROUP_METHOD = 'groupBy';
const LODASH = ['lodash', 'lodash-es'];
const LODASH_SHAPES = new Map<string | undefined, Shape>([
  ['sumBy', AGGREGATE],
  ['maxBy', AGGREGATE],
  ['minBy', AGGREGATE],
  ['meanBy', AGGREGATE],
  ['groupBy', AGGREGATE],
  ['countBy', AGGREGATE],
  ['sortBy', SORT],
  ['orderBy', SORT],
  ['filter', FILTER],
  ['find', FILTER],
  ['some', FILTER],
  ['every', FILTER],
  ['size', COUNT],
  ['isEmpty', COUNT],
]);
const LOOPS = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

export function outerOf(node: TSESTree.Node): TSESTree.Node {
  return outermostOf(node, TYPE_WRAPPERS);
}

export function homeOf(node: TSESTree.Node): MaybeNode {
  return ancestorsOf(node).find(
    (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
  );
}

function crossesRepeat(read: TSESTree.Node, home: MaybeNode): boolean {
  const path = ancestorsOf(read);
  const inside = path.slice(
    0,
    path.findIndex((ancestor) => ancestor === home),
  );
  return inside.some(
    (ancestor, index) =>
      isFunctionNode(ancestor) ||
      (LOOPS.has(ancestor.type) &&
        !(
          ancestor.type === AST_NODE_TYPES.ForOfStatement &&
          ancestor.right === (inside[index - 1] ?? read)
        )),
  );
}

export type ResultBinding = {
  readonly outer: TSESTree.Node;
  readonly declarator: TSESTree.VariableDeclarator | undefined;
  readonly variable: TSESLint.Scope.Variable | undefined;
};

export function resultBinding(context: Context, node: TSESTree.Node): ResultBinding {
  const outer = outerOf(node);
  const declarator = outer.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== outer) {
    return { outer, declarator: undefined, variable: undefined };
  }
  const [variable] =
    declarator.id.type === AST_NODE_TYPES.Identifier
      ? context.sourceCode.getDeclaredVariables(declarator)
      : [];
  return { outer, declarator, variable };
}

export function resultSite(context: Context, node: TSESTree.Node): MaybeNode {
  const { outer, declarator, variable } = resultBinding(context, node);
  if (declarator === undefined) {
    return outer;
  }
  if (variable === undefined) {
    return undefined;
  }
  const reads = variable.references.filter((reference) => reference.isRead());
  const writes = variable.references.filter((reference) => reference.isWrite());
  const read = reads.length === 1 && writes.length === 1 ? reads[0]?.identifier : undefined;
  return read === undefined || crossesRepeat(read, homeOf(declarator)) ? undefined : read;
}

function isLengthRead(member: TSESTree.MemberExpression): boolean {
  const parent = member.parent;
  const assigned = parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === member;
  return (
    memberName(member) === 'length' && !assigned && parent.type !== AST_NODE_TYPES.UpdateExpression
  );
}

function extremeOfMap(context: Context, call: TSESTree.CallExpression): MaybeNode {
  const spread = outerOf(call).parent;
  const outer = spread?.type === AST_NODE_TYPES.SpreadElement ? spread.parent : undefined;
  const callee =
    outer?.type === AST_NODE_TYPES.CallExpression ? unwrapped(outer.callee) : undefined;
  const object =
    callee?.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
  const isMath =
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    object?.type === AST_NODE_TYPES.Identifier &&
    object.name === 'Math' &&
    EXTREMES.has(memberName(callee));
  return isMath && readsOnlyFields(context, call.arguments[0], { rows: 1 }) ? outer : undefined;
}

function methodShape(context: Context, member: TSESTree.MemberExpression): Use | undefined {
  const call = outerOf(member).parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.callee !== outerOf(member)) {
    return undefined;
  }
  const method = memberName(member);
  const [callback] = call.arguments;
  if (FILTER_METHODS.has(method) && readsOnlyFields(context, callback, { rows: 1 })) {
    return { node: call, shape: FILTER };
  }
  if (SORT_METHODS.has(method) && readsOnlyFields(context, callback, { rows: 2 })) {
    return { node: call, shape: SORT };
  }
  if (
    REDUCE_METHODS.has(method) &&
    readsOnlyFields(context, callback, { rows: 1, accumulator: true })
  ) {
    return { node: call, shape: AGGREGATE };
  }
  const extreme = method === 'map' ? extremeOfMap(context, call) : undefined;
  return extreme === undefined ? undefined : { node: extreme, shape: AGGREGATE };
}

function memberShape(context: Context, member: TSESTree.MemberExpression): Use | undefined {
  if (isLengthRead(member)) {
    return { node: member, shape: COUNT };
  }
  return methodShape(context, member);
}

function isIteratee(context: Context, node: MaybeNode): boolean {
  const target = unwrapped(node);
  if (target === undefined) {
    return false;
  }
  if (stringValue(target) !== undefined) {
    return true;
  }
  if (target.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      target.elements.length > 0 && target.elements.every((item) => stringValue(item) !== undefined)
    );
  }
  return readsOnlyFields(context, target, { rows: 1 });
}

function lodashName(context: Context, callee: TSESTree.Node): string | undefined {
  const target = unwrapped(callee);
  const identifier =
    target.type === AST_NODE_TYPES.MemberExpression ? unwrapped(target.object) : target;
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const binding = libraryBinding(variableOf(context.sourceCode, identifier), LODASH);
  if (binding === undefined) {
    return undefined;
  }
  return target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : binding.name;
}

function lodashShape(context: Context, call: TSESTree.CallExpression): Use | undefined {
  const shape = LODASH_SHAPES.get(lodashName(context, call.callee));
  if (shape === COUNT) {
    return call.arguments.length === 1 ? { node: call, shape } : undefined;
  }
  return shape !== undefined && isIteratee(context, call.arguments[1])
    ? { node: call, shape }
    : undefined;
}

function argumentShape(context: Context, call: TSESTree.CallExpression): Use | undefined {
  const callee = unwrapped(call.callee);
  const member = callee.type === AST_NODE_TYPES.MemberExpression ? callee : undefined;
  const owner = member === undefined ? undefined : unwrapped(member.object);
  const grouping =
    member !== undefined &&
    owner?.type === AST_NODE_TYPES.Identifier &&
    GROUP_OWNERS.has(owner.name) &&
    memberName(member) === GROUP_METHOD;
  if (grouping) {
    return readsOnlyFields(context, call.arguments[1], { rows: 1 })
      ? { node: call, shape: AGGREGATE }
      : undefined;
  }
  return lodashShape(context, call);
}

export function useOf(context: Context, site: TSESTree.Node): Use | undefined {
  const outer = outerOf(site);
  const parent = outer.parent;
  if (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === outer &&
    !parent.computed
  ) {
    return memberShape(context, parent);
  }
  if (parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === outer) {
    return argumentShape(context, parent);
  }
  return undefined;
}
