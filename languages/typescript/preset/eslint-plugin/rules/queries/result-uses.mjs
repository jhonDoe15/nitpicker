import { libraryBinding, variableOf } from '../../../libraries/module-bindings.mjs';
import { ancestorsOf, chainOf } from '../analysis/ancestry.mjs';
import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mjs';
import { isTypeWrapper, memberName, unwrapped } from '../security/security-values.mjs';
import { readsOnlyFields } from './row-callbacks.mjs';

export const COUNT = 'count';
export const FILTER = 'filter';
export const SORT = 'sort';
export const AGGREGATE = 'aggregate';

const FILTER_METHODS = new Set(['filter', 'some', 'every', 'find', 'findIndex', 'findLast']);
const SORT_METHODS = new Set(['sort', 'toSorted']);
const REDUCE_METHODS = new Set(['reduce', 'reduceRight']);
const EXTREMES = new Set(['max', 'min']);
const GROUP_OWNERS = new Set(['Object', 'Map']);
const GROUP_METHOD = 'groupBy';
const LODASH = ['lodash', 'lodash-es'];
const LODASH_SHAPES = new Map([
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
const LOOPS = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

function isWrapper(node) {
  return isTypeWrapper(node) || node?.type === 'ChainExpression';
}

function outerOf(node) {
  return chainOf(node, (current) => (isWrapper(current.parent) ? current.parent : undefined)).at(
    -1,
  );
}

function homeOf(node) {
  return ancestorsOf(node).find((ancestor) => isFunctionNode(ancestor) || ancestor.parent === null);
}

function crossesRepeat(read, home) {
  const path = ancestorsOf(read);
  const inside = path.slice(0, path.indexOf(home));
  return inside.some(
    (ancestor, index) =>
      isFunctionNode(ancestor) ||
      (LOOPS.has(ancestor.type) &&
        !(ancestor.type === 'ForOfStatement' && ancestor.right === (inside[index - 1] ?? read))),
  );
}

export function resultSite(context, node) {
  const outer = outerOf(node);
  const declarator = outer.parent;
  if (declarator.type !== 'VariableDeclarator' || declarator.init !== outer) {
    return outer;
  }
  if (declarator.id.type !== 'Identifier') {
    return undefined;
  }
  const [variable] = context.sourceCode.getDeclaredVariables(declarator);
  const reads = variable.references.filter((reference) => reference.isRead());
  const writes = variable.references.filter((reference) => reference.isWrite());
  const read = reads.length === 1 && writes.length === 1 ? reads[0].identifier : undefined;
  return read === undefined || crossesRepeat(read, homeOf(declarator)) ? undefined : read;
}

function isLengthRead(member) {
  const parent = member.parent;
  const assigned = parent.type === 'AssignmentExpression' && parent.left === member;
  return memberName(member) === 'length' && !assigned && parent.type !== 'UpdateExpression';
}

function extremeOfMap(context, call) {
  const spread = outerOf(call).parent;
  const outer = spread.type === 'SpreadElement' ? spread.parent : undefined;
  const callee = outer?.type === 'CallExpression' ? unwrapped(outer.callee) : undefined;
  const isMath =
    callee?.type === 'MemberExpression' &&
    unwrapped(callee.object).type === 'Identifier' &&
    unwrapped(callee.object).name === 'Math' &&
    EXTREMES.has(memberName(callee));
  return isMath && readsOnlyFields(context, call.arguments[0], { rows: 1 }) ? outer : undefined;
}

function methodShape(context, member) {
  const call = outerOf(member).parent;
  if (call.type !== 'CallExpression' || call.callee !== outerOf(member)) {
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

function memberShape(context, member) {
  if (isLengthRead(member)) {
    return { node: member, shape: COUNT };
  }
  return methodShape(context, member);
}

function isIteratee(context, node) {
  const target = unwrapped(node);
  if (target === undefined) {
    return false;
  }
  if (stringValue(target) !== undefined) {
    return true;
  }
  if (target.type === 'ArrayExpression') {
    return (
      target.elements.length > 0 && target.elements.every((item) => stringValue(item) !== undefined)
    );
  }
  return readsOnlyFields(context, target, { rows: 1 });
}

function lodashName(context, callee) {
  const target = unwrapped(callee);
  const identifier = target.type === 'MemberExpression' ? unwrapped(target.object) : target;
  if (identifier.type !== 'Identifier') {
    return undefined;
  }
  const binding = libraryBinding(variableOf(context.sourceCode, identifier), LODASH);
  if (binding === undefined) {
    return undefined;
  }
  return target.type === 'MemberExpression' ? memberName(target) : (binding.name ?? undefined);
}

function lodashShape(context, call) {
  const shape = LODASH_SHAPES.get(lodashName(context, call.callee));
  if (shape === COUNT) {
    return call.arguments.length === 1 ? { node: call, shape } : undefined;
  }
  return shape !== undefined && isIteratee(context, call.arguments[1])
    ? { node: call, shape }
    : undefined;
}

function argumentShape(context, call) {
  const callee = unwrapped(call.callee);
  const owner = callee.type === 'MemberExpression' ? unwrapped(callee.object) : undefined;
  const grouping =
    owner?.type === 'Identifier' &&
    GROUP_OWNERS.has(owner.name) &&
    memberName(callee) === GROUP_METHOD;
  if (grouping) {
    return readsOnlyFields(context, call.arguments[1], { rows: 1 })
      ? { node: call, shape: AGGREGATE }
      : undefined;
  }
  return lodashShape(context, call);
}

export function useOf(context, site) {
  const outer = outerOf(site);
  const parent = outer.parent;
  if (parent.type === 'MemberExpression' && parent.object === outer && !parent.computed) {
    return memberShape(context, parent);
  }
  if (parent.type === 'CallExpression' && parent.arguments[0] === outer) {
    return argumentShape(context, parent);
  }
  return undefined;
}
