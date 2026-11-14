import { rebuild } from '../../../near-duplicates/tree/nodes.mjs';
import { isCollectionKind, kindOfType } from './types.mjs';

const STRING = 'string';
const INDEX = 'index';
const LENGTH = 'length';
const IS_EMPTY = 'isEmpty';
const ARRAY = 'array';

const INDEX_SEARCHES = new Set(['indexOf', 'lastIndexOf', 'indexOfFirst', 'indexOfLast']);
const MATH = new Set(['Math', 'StrictMath']);
const STRING_READS = new Set([
  LENGTH,
  IS_EMPTY,
  'isBlank',
  'trim',
  'strip',
  'toLowerCase',
  'toUpperCase',
  'hashCode',
]);
const OPTIONAL_READS = new Set(['isPresent', IS_EMPTY]);
const COLLECTION_READS = new Set(['size', IS_EMPTY]);
const FLOAT_LITERAL = /[.eEdDfF]/u;

function receiverKind(receiver, scope) {
  const type = receiver?.kind === 'name' ? scope.types.get(receiver.value) : undefined;
  return type === undefined ? undefined : kindOfType(type, scope.resolver);
}

function sizeName(kind) {
  return kind === STRING ? 'length' : 'size';
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
  const sized = kind === STRING || isCollectionKind(kind);
  const isEmpty = callee.value === IS_EMPTY || callee.value === 'isNotEmpty';
  return sized && isEmpty && call.children.length === 1 ? kind : undefined;
}

function emptiness(call, callee, [kind, scope]) {
  const size = sizeOf(call, { receiver: callee.children[0], kind }, scope);
  const zero = { kind: 'literal', literal: 'number', value: '0', children: [] };
  const operator = callee.value === IS_EMPTY ? '==' : '!=';
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
  if (kind === STRING) {
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
  if (args.length === 0 && (isSize || (callee.value === LENGTH && kind === STRING))) {
    return 'size';
  }
  if (INDEX_SEARCHES.has(callee.value) && (kind === STRING || isCollectionKind(kind))) {
    return INDEX;
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

const PYTHON_BUILTINS = { len: 'size', abs: 'absolute' };
const GO_BUILTINS = { len: 'size', cap: 'size' };
const GO_SEARCHES = new Set(['Index', 'LastIndex', 'IndexByte', 'LastIndexByte', 'IndexRune']);
const GO_FUNCTION_SEARCHES = new Set(['IndexFunc', 'LastIndexFunc', 'IndexAny', 'LastIndexAny']);
const GO_BYTE_PACKAGES = new Set(['strings', 'bytes']);
const PYTHON_SEARCHES = new Set(['find', 'rfind']);
const PYTHON_STRINGS = new Set(['str']);

function isGoSearch(callee) {
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  if (owner?.kind !== 'name' || owner.binding !== 'free') {
    return false;
  }
  return (
    (GO_BYTE_PACKAGES.has(owner.value) &&
      (GO_SEARCHES.has(callee.value) || GO_FUNCTION_SEARCHES.has(callee.value))) ||
    (owner.value === 'slices' && (callee.value === 'Index' || callee.value === 'IndexFunc'))
  );
}

function isPythonSearch(callee, scope) {
  const receiver = callee.kind === 'member' ? callee.children[0] : undefined;
  const type = receiver?.kind === 'name' ? scope.types.get(receiver.value) : undefined;
  return PYTHON_SEARCHES.has(callee.value) && PYTHON_STRINGS.has(type);
}

function builtinModel(call, scope) {
  const [callee, ...args] = call.children;
  if (scope.go && isGoSearch(callee)) {
    return INDEX;
  }
  if (scope.python && isPythonSearch(callee, scope)) {
    return INDEX;
  }
  const isBuiltin = callee.kind === 'name' && callee.binding === 'free' && args.length === 1;
  const builtins = scope.python ? PYTHON_BUILTINS : GO_BUILTINS;
  if (!((scope.python || scope.go) && isBuiltin)) {
    return undefined;
  }
  return Object.hasOwn(builtins, callee.text ?? callee.value)
    ? builtins[callee.text ?? callee.value]
    : undefined;
}

function annotatedCall(call, scope) {
  const callee = call.children[0];
  if (scope.python || scope.go) {
    const model = builtinModel(call, scope);
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
  const isSize = member.value === 'size' && (kind === ARRAY || isCollectionKind(kind));
  const isLength = member.value === LENGTH && (kind === ARRAY || kind === STRING);
  return isSize || isLength ? { ...member, model: 'size' } : member;
}

function annotatedKotlinCount(call, scope) {
  const callee = call.children[0];
  const kind = callee.kind === 'member' ? receiverKind(callee.children[0], scope) : undefined;
  const isCount = callee.value === 'count' && call.children.length === 1;
  if (!(scope.kotlin && isCount && (kind === ARRAY || isCollectionKind(kind)))) {
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
