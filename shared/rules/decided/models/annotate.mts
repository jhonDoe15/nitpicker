import { isOneOf, present, rebuild } from '../../../near-duplicates/tree/nodes.mts';
import { isCollectionKind, kindOfType } from './types.mts';
import type { ModelName } from '../../../logic/typed/term-types.mts';
import type { FlowNode, ModelScope } from '../typed/decided-types.mts';

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

function withoutText(node: FlowNode): FlowNode {
  const { text: _text, ...rest } = node;
  return rest;
}

function withoutModel(node: FlowNode): FlowNode {
  const { model: _model, ...rest } = node;
  return rest;
}

function receiverKind(receiver: FlowNode | undefined, scope: ModelScope): string | undefined {
  const type =
    receiver?.kind === 'name' && receiver.value !== undefined
      ? scope.types.get(receiver.value)
      : undefined;
  return type === undefined ? undefined : kindOfType(type, scope.resolver);
}

function sizeName(kind: string | undefined): string {
  return kind === STRING ? 'length' : 'size';
}

function sizeOf(
  call: FlowNode,
  { receiver, kind }: { readonly receiver: FlowNode; readonly kind: string | undefined },
  scope: ModelScope,
): FlowNode {
  const name = sizeName(kind);
  const member = withoutText({ ...call, kind: 'member', value: name, children: [receiver] });
  return scope.kotlin
    ? { ...member, ...(call.text === undefined ? {} : { text: call.text }), model: 'size' }
    : { ...call, kind: 'call', children: [member], model: 'size' };
}

function isEmptiness(call: FlowNode, callee: FlowNode, scope: ModelScope): string | undefined {
  const kind = receiverKind(callee.children[0], scope);
  const sized = kind === STRING || isCollectionKind(kind);
  const isEmpty = callee.value === IS_EMPTY || callee.value === 'isNotEmpty';
  return sized && isEmpty && call.children.length === 1 ? kind : undefined;
}

function emptiness(
  call: FlowNode,
  callee: FlowNode,
  [kind, scope]: readonly [string | undefined, ModelScope],
): FlowNode {
  const size = sizeOf(call, { receiver: present(callee.children[0]), kind }, scope);
  const zero: FlowNode = { kind: 'literal', literal: 'number', value: '0', children: [] };
  const operator = callee.value === IS_EMPTY ? '==' : '!=';
  return { ...call, kind: 'binary', value: operator, children: [size, zero] };
}

function isFloatArgument(argument: FlowNode, scope: ModelScope): boolean {
  if (argument.kind === 'literal') {
    return argument.literal === 'number' && FLOAT_LITERAL.test(String(argument.value));
  }
  return receiverKind(argument, scope) === 'float';
}

function isMathCall(callee: FlowNode): boolean {
  const owner = present(callee.children[0]);
  return callee.kind === 'member' && owner.kind === 'name' && isOneOf(MATH, owner.value);
}

function isKotlinAbs(callee: FlowNode, scope: ModelScope): boolean {
  const text = callee.text ?? '';
  return scope.kotlin && (text === 'kotlin.math.abs' || (text === 'abs' && callee.kind === 'name'));
}

function modelOfCall(call: FlowNode, scope: ModelScope): ModelName | undefined {
  const [rawCallee, ...args] = call.children;
  const callee = present(rawCallee);
  if (callee.value === 'abs' && args.length === 1 && isFloatArgument(present(args[0]), scope)) {
    return (callee.kind === 'member' && isMathCall(callee)) || isKotlinAbs(callee, scope)
      ? 'absolute'
      : undefined;
  }
  if (callee.value === 'random' && args.length === 0 && isMathCall(callee)) {
    return 'random';
  }
  return undefined;
}

function readsOf(kind: string | undefined): ReadonlySet<string> {
  if (kind === STRING) {
    return STRING_READS;
  }
  if (kind === 'optional') {
    return OPTIONAL_READS;
  }
  return isCollectionKind(kind) ? COLLECTION_READS : new Set();
}

function modelOfMember(call: FlowNode, scope: ModelScope): ModelName | undefined {
  const [rawCallee, ...args] = call.children;
  const callee = present(rawCallee);
  const kind = receiverKind(callee.children[0], scope);
  if (kind === undefined) {
    return undefined;
  }
  const isSize = callee.value === 'size' && isCollectionKind(kind);
  if (args.length === 0 && (isSize || (callee.value === LENGTH && kind === STRING))) {
    return 'size';
  }
  if (isOneOf(INDEX_SEARCHES, callee.value) && (kind === STRING || isCollectionKind(kind))) {
    return INDEX;
  }
  return args.length === 0 && isOneOf(readsOf(kind), callee.value) ? 'stable' : undefined;
}

function typeOfName(node: FlowNode, scope: ModelScope): string | undefined {
  return node.value === undefined ? undefined : scope.types.get(node.value);
}

function getterKey(callee: FlowNode, scope: ModelScope): string | undefined {
  if (callee.kind === 'name') {
    return present(callee.value).replace(/\(\)$/u, '');
  }
  const owner = present(callee.children[0]);
  const type = owner.kind === 'this' ? scope.owner : typeOfName(owner, scope);
  return type === undefined ? undefined : `${type.replace(/<.*$/u, '')}#${String(callee.value)}`;
}

function modelOfGetter(call: FlowNode, scope: ModelScope): ModelName | undefined {
  const [callee, ...args] = call.children;
  const key = args.length === 0 ? getterKey(present(callee), scope) : undefined;
  return key !== undefined && scope.getters.has(key) ? 'stable' : undefined;
}

const PYTHON_BUILTINS: Readonly<Record<string, ModelName>> = { len: 'size', abs: 'absolute' };
const GO_BUILTINS: Readonly<Record<string, ModelName>> = { len: 'size', cap: 'size' };
const GO_SEARCHES = new Set(['Index', 'LastIndex', 'IndexByte', 'LastIndexByte', 'IndexRune']);
const GO_FUNCTION_SEARCHES = new Set(['IndexFunc', 'LastIndexFunc', 'IndexAny', 'LastIndexAny']);
const GO_BYTE_PACKAGES = new Set(['strings', 'bytes']);
const PYTHON_SEARCHES = new Set(['find', 'rfind']);
const PYTHON_STRINGS = new Set(['str']);

function isGoSearch(callee: FlowNode): boolean {
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  if (owner?.kind !== 'name' || owner.binding !== 'free') {
    return false;
  }
  return (
    (isOneOf(GO_BYTE_PACKAGES, owner.value) &&
      (isOneOf(GO_SEARCHES, callee.value) || isOneOf(GO_FUNCTION_SEARCHES, callee.value))) ||
    (owner.value === 'slices' && (callee.value === 'Index' || callee.value === 'IndexFunc'))
  );
}

function isPythonSearch(callee: FlowNode, scope: ModelScope): boolean {
  const receiver = callee.kind === 'member' ? callee.children[0] : undefined;
  const type = receiver?.kind === 'name' ? typeOfName(receiver, scope) : undefined;
  return isOneOf(PYTHON_SEARCHES, callee.value) && isOneOf(PYTHON_STRINGS, type);
}

function builtinModel(call: FlowNode, scope: ModelScope): ModelName | undefined {
  const [rawCallee, ...args] = call.children;
  const callee = present(rawCallee);
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
  const builtin = callee.text ?? callee.value;
  return builtin !== undefined && Object.hasOwn(builtins, builtin) ? builtins[builtin] : undefined;
}

function annotatedCall(call: FlowNode, scope: ModelScope): FlowNode {
  const callee = present(call.children[0]);
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

function annotatedMember(member: FlowNode, scope: ModelScope): FlowNode {
  const kind = receiverKind(member.children[0], scope);
  const isSize = member.value === 'size' && (kind === ARRAY || isCollectionKind(kind));
  const isLength = member.value === LENGTH && (kind === ARRAY || kind === STRING);
  return isSize || isLength ? { ...member, model: 'size' } : member;
}

function annotatedKotlinCount(call: FlowNode, scope: ModelScope): FlowNode {
  const callee = present(call.children[0]);
  const kind = callee.kind === 'member' ? receiverKind(callee.children[0], scope) : undefined;
  const isCount = callee.value === 'count' && call.children.length === 1;
  if (!(scope.kotlin && isCount && (kind === ARRAY || isCollectionKind(kind)))) {
    return annotatedCall(call, scope);
  }
  return sizeOf(call, { receiver: present(callee.children[0]), kind }, scope);
}

function plain(callee: FlowNode): FlowNode {
  return callee.model === undefined ? callee : withoutModel(callee);
}

export function modelledTree(tree: FlowNode, scope: ModelScope): FlowNode {
  return rebuild(tree, (node: FlowNode, children: FlowNode[]): FlowNode => {
    const built = { ...node, children };
    if (node.kind === 'call') {
      const [callee, ...args] = children;
      return annotatedKotlinCount({ ...built, children: [plain(present(callee)), ...args] }, scope);
    }
    return node.kind === 'member' ? annotatedMember(built, scope) : built;
  });
}
