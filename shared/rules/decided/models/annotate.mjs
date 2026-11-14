import { rebuild } from '../../../near-duplicates/tree/nodes.mjs';
import { isCollectionKind, kindOfType } from './types.mjs';

const INDEX_SEARCHES = new Set(['indexOf', 'lastIndexOf', 'indexOfFirst', 'indexOfLast']);
const MATH = new Set(['Math', 'StrictMath']);
const STRING_READS = new Set([
  'length',
  'isEmpty',
  'isBlank',
  'trim',
  'strip',
  'toLowerCase',
  'toUpperCase',
  'hashCode',
]);
const OPTIONAL_READS = new Set(['isPresent', 'isEmpty']);
const COLLECTION_READS = new Set(['size', 'isEmpty']);
const FLOAT_LITERAL = /[.eEdDfF]/u;

function receiverKind(receiver, scope) {
  const type = receiver?.kind === 'name' ? scope.types.get(receiver.value) : undefined;
  return type === undefined ? undefined : kindOfType(type);
}

function sizeName(kind) {
  return kind === 'string' ? 'length' : 'size';
}

function sizeOf(call, { receiver, kind }, scope) {
  const name = sizeName(kind);
  const member = { ...call, kind: 'member', value: name, children: [receiver], text: undefined };
  return scope.kotlin
    ? { ...member, text: call.text, model: 'size' }
    : { ...call, kind: 'call', children: [member], model: 'size' };
}

function isEmptiness(call, callee, scope) {
  const kind = receiverKind(callee.children[0], scope);
  const sized = kind === 'string' || isCollectionKind(kind);
  const isEmpty = callee.value === 'isEmpty' || callee.value === 'isNotEmpty';
  return sized && isEmpty && call.children.length === 1 ? kind : undefined;
}

function emptiness(call, callee, [kind, scope]) {
  const size = sizeOf(call, { receiver: callee.children[0], kind }, scope);
  const zero = { kind: 'literal', literal: 'number', value: '0', children: [] };
  const operator = callee.value === 'isEmpty' ? '==' : '!=';
  return { ...call, kind: 'binary', value: operator, children: [size, zero] };
}

function isFloatArgument(argument, scope) {
  if (argument.kind === 'literal') {
    return argument.literal === 'number' && FLOAT_LITERAL.test(argument.value);
  }
  return receiverKind(argument, scope) === 'float';
}

function isMathCall(callee) {
  const owner = callee.children[0];
  return callee.kind === 'member' && owner.kind === 'name' && MATH.has(owner.value);
}

function isKotlinAbs(callee, scope) {
  const text = callee.text ?? '';
  return scope.kotlin && (text === 'kotlin.math.abs' || (text === 'abs' && callee.kind === 'name'));
}

function modelOfCall(call, scope) {
  const [callee, ...args] = call.children;
  if (callee.value === 'abs' && args.length === 1 && isFloatArgument(args[0], scope)) {
    return (callee.kind === 'member' && isMathCall(callee)) || isKotlinAbs(callee, scope)
      ? 'absolute'
      : undefined;
  }
  if (callee.value === 'random' && args.length === 0 && isMathCall(callee)) {
    return 'random';
  }
  return undefined;
}

function readsOf(kind) {
  if (kind === 'string') {
    return STRING_READS;
  }
  if (kind === 'optional') {
    return OPTIONAL_READS;
  }
  return isCollectionKind(kind) ? COLLECTION_READS : new Set();
}

function modelOfMember(call, scope) {
  const [callee, ...args] = call.children;
  const kind = receiverKind(callee.children[0], scope);
  if (kind === undefined) {
    return undefined;
  }
  const isSize = callee.value === 'size' && isCollectionKind(kind);
  if (args.length === 0 && (isSize || (callee.value === 'length' && kind === 'string'))) {
    return 'size';
  }
  if (INDEX_SEARCHES.has(callee.value) && (kind === 'string' || isCollectionKind(kind))) {
    return 'index';
  }
  return args.length === 0 && readsOf(kind).has(callee.value) ? 'stable' : undefined;
}

function getterKey(callee, scope) {
  if (callee.kind === 'name') {
    return callee.value.replace(/\(\)$/u, '');
  }
  const owner = callee.children[0];
  const type = owner.kind === 'this' ? scope.owner : scope.types.get(owner?.value);
  return type === undefined ? undefined : `${type.replace(/<.*$/u, '')}#${callee.value}`;
}

function modelOfGetter(call, scope) {
  const [callee, ...args] = call.children;
  const key = args.length === 0 ? getterKey(callee, scope) : undefined;
  return key !== undefined && scope.getters.has(key) ? 'stable' : undefined;
}

function pythonModel(call, scope) {
  const [callee, ...args] = call.children;
  const isBuiltin = callee.kind === 'name' && callee.binding === 'free' && args.length === 1;
  if (!scope.python || !isBuiltin) {
    return undefined;
  }
  return { len: 'size', abs: 'absolute' }[callee.text ?? callee.value];
}

function annotatedCall(call, scope) {
  const callee = call.children[0];
  if (scope.python) {
    const model = pythonModel(call, scope);
    return model === undefined ? call : { ...call, model };
  }
  const kind = callee.kind === 'member' ? isEmptiness(call, callee, scope) : undefined;
  if (kind !== undefined) {
    return emptiness(call, callee, [kind, scope]);
  }
  const model =
    modelOfCall(call, scope) ??
    (callee.kind === 'member' ? modelOfMember(call, scope) : undefined) ??
    modelOfGetter(call, scope);
  return model === undefined ? call : { ...call, model };
}

function annotatedMember(member, scope) {
  const kind = receiverKind(member.children[0], scope);
  const isSize = member.value === 'size' && (kind === 'array' || isCollectionKind(kind));
  const isLength = member.value === 'length' && (kind === 'array' || kind === 'string');
  return isSize || isLength ? { ...member, model: 'size' } : member;
}

function annotatedKotlinCount(call, scope) {
  const callee = call.children[0];
  const kind = callee.kind === 'member' ? receiverKind(callee.children[0], scope) : undefined;
  const isCount = callee.value === 'count' && call.children.length === 1;
  if (!scope.kotlin || !isCount || !(kind === 'array' || isCollectionKind(kind))) {
    return annotatedCall(call, scope);
  }
  return sizeOf(call, { receiver: callee.children[0], kind }, scope);
}

function plain(callee) {
  return callee.model === undefined ? callee : { ...callee, model: undefined };
}

/**
 * `tree` with value models on the calls and properties it reads: sizes and lengths, index
 * searches, absolute values of floating-point numbers, random numbers and stable reads, found by
 * the declared types of the names they are called on. `isEmpty()` and `isNotEmpty()` become a
 * comparison of the size with 0. `scope` has `types` (names to type text), `getters` (the
 * project getters that only return a field), the `owner` class and the language flags.
 */
export function modelledTree(tree, scope) {
  return rebuild(tree, (node, children) => {
    const built = { ...node, children };
    if (node.kind === 'call') {
      const [callee, ...args] = children;
      return annotatedKotlinCount({ ...built, children: [plain(callee), ...args] }, scope);
    }
    return node.kind === 'member' ? annotatedMember(built, scope) : built;
  });
}
