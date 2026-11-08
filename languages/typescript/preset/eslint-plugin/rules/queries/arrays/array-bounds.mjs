import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mjs';
import { isFixedCollection } from '../../concurrency/collections/fixed-collections.mjs';
import { descendants } from '../../concurrency/io-origin.mjs';
import { memberName, typeServices, unwrapped } from '../../security/security-values.mjs';
import { chainSteps } from '../query-chains.mjs';

const CHUNK_NAME = /chunk|batch|partition|paginat/iu;
const ARRAY_MAKERS = new Set([
  'map',
  'filter',
  'flatMap',
  'flat',
  'concat',
  'split',
  'toSorted',
  'toReversed',
]);
const ARRAY_STATICS = new Set(['from', 'keys', 'values', 'entries']);
const SIZE_KEEPING = new Set([
  'map',
  'filter',
  'flatMap',
  'toSorted',
  'toReversed',
  'sort',
  'reverse',
]);
const ITERATING = new Set(['map', 'forEach', 'flatMap', 'reduce', 'every', 'some']);
const ARRAY_ANNOTATIONS = new Set(['TSArrayType']);
const ARRAY_TYPE_NAMES = new Set(['Array', 'ReadonlyArray']);
const SIZE_MEMBERS = new Set(['length', 'size']);
const EMPTY_CHECKS = new Set(['isEmpty', 'isNotEmpty', 'isNonEmpty', 'isEmptyArray']);
const QUERY_STEPS = new Set(['selectFrom', 'select', 'from', 'createQueryBuilder', 'subQuery']);

function typeKind(context, node) {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  if (checker.isTupleType(type)) {
    return 'tuple';
  }
  const array =
    checker.isArrayType(type) ||
    (type.isUnion() && type.types.some((member) => checker.isArrayType(member)));
  return array ? 'array' : undefined;
}

function annotationOf(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const name = definition?.name;
  const annotation = name?.typeAnnotation?.typeAnnotation;
  if (annotation?.type === 'TSTypeOperator') {
    return annotation.typeAnnotation;
  }
  return annotation;
}

function hasArrayAnnotation(context, identifier) {
  const annotation = annotationOf(context, identifier);
  const reference = annotation?.type === 'TSTypeReference' ? annotation.typeName : undefined;
  return ARRAY_ANNOTATIONS.has(annotation?.type) || ARRAY_TYPE_NAMES.has(reference?.name);
}

function constInit(context, identifier) {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const declarator = definition?.type === 'Variable' ? definition.node : undefined;
  return declarator?.id.type === 'Identifier' && definition.parent.kind === 'const'
    ? unwrapped(declarator.init)
    : undefined;
}

function isArrayMaking(node) {
  const target = unwrapped(node);
  if (target?.type === 'AwaitExpression') {
    return false;
  }
  if (target?.type === 'ArrayExpression') {
    return target.elements.some((element) => element?.type === 'SpreadElement');
  }
  const callee = target?.type === 'CallExpression' ? unwrapped(target.callee) : undefined;
  if (callee?.type !== 'MemberExpression') {
    return false;
  }
  const owner = unwrapped(callee.object);
  const isStatic = owner.type === 'Identifier' && ['Array', 'Object'].includes(owner.name);
  return isStatic ? ARRAY_STATICS.has(memberName(callee)) : ARRAY_MAKERS.has(memberName(callee));
}

function isSubquery(context, node) {
  const target = unwrapped(node);
  if (isFunctionNode(target) || target?.type === 'TaggedTemplateExpression') {
    return true;
  }
  const value = target?.type === 'Identifier' ? (constInit(context, target) ?? target) : target;
  return chainSteps(value).steps.some((step) => QUERY_STEPS.has(step.name));
}

/** Whether `node` holds an array whose length is only known at run time (not a literal or a fixed window). */
export function isRuntimeArray(context, node, { needsEvidence }) {
  const target = unwrapped(node);
  if (target === undefined || isSubquery(context, target) || isFixedCollection(context, target)) {
    return false;
  }
  if (target.type === 'ArrayExpression' && !isArrayMaking(target)) {
    return false;
  }
  const kind = typeKind(context, target);
  if (kind !== undefined) {
    return kind === 'array';
  }
  if (!needsEvidence) {
    return ['Identifier', 'MemberExpression', 'CallExpression', 'ArrayExpression'].includes(
      target.type,
    );
  }
  if (target.type === 'Identifier') {
    return hasArrayAnnotation(context, target) || isArrayMaking(constInit(context, target));
  }
  return isArrayMaking(target);
}

function sameSizeSource(node) {
  if (node?.type === 'CallExpression') {
    const callee = unwrapped(node.callee);
    return callee.type === 'MemberExpression' && SIZE_KEEPING.has(memberName(callee))
      ? unwrapped(callee.object)
      : undefined;
  }
  if (
    node?.type === 'ArrayExpression' &&
    node.elements.length === 1 &&
    node.elements[0]?.type === 'SpreadElement'
  ) {
    return unwrapped(node.elements[0].argument);
  }
  const set =
    node?.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Set';
  return set ? unwrapped(node.arguments[0]) : undefined;
}

function sourcesOf(context, node) {
  const texts = new Set();
  let current = unwrapped(node);
  for (let depth = 0; depth < 6 && current !== undefined; depth += 1) {
    texts.add(context.sourceCode.getText(current));
    const held = current.type === 'Identifier' ? constInit(context, current) : undefined;
    current = current.type === 'Identifier' ? held : sameSizeSource(current);
  }
  return texts;
}

function enclosingFunctions(node) {
  return ancestorsOf(node).filter((ancestor) => isFunctionNode(ancestor));
}

function checksSize(context, fn, texts) {
  return [...descendants(fn.body)].some(
    (child) =>
      (child.type === 'MemberExpression' &&
        SIZE_MEMBERS.has(memberName(child)) &&
        texts.has(context.sourceCode.getText(unwrapped(child.object)))) ||
      (child.type === 'CallExpression' &&
        EMPTY_CHECKS.has(callName(child)) &&
        child.arguments.length === 1 &&
        texts.has(context.sourceCode.getText(unwrapped(child.arguments[0])))),
  );
}

function callName(call) {
  const callee = unwrapped(call?.callee);
  if (callee?.type === 'Identifier') {
    return callee.name;
  }
  return callee?.type === 'MemberExpression' ? memberName(callee) : undefined;
}

function isChunkCall(node) {
  const target = unwrapped(node);
  return target?.type === 'CallExpression' && CHUNK_NAME.test(callName(target) ?? '');
}

function chunkedCallback(context, fn) {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.includes(fn)) {
    return false;
  }
  if (isChunkCall(call)) {
    return true;
  }
  const callee = unwrapped(call.callee);
  if (callee.type !== 'MemberExpression' || !ITERATING.has(memberName(callee))) {
    return false;
  }
  const owner = unwrapped(callee.object);
  return (
    isChunkCall(owner) || (owner.type === 'Identifier' && isChunkCall(constInit(context, owner)))
  );
}

function chunkedLoop(node) {
  return ancestorsOf(node).some(
    (ancestor) => ancestor.type === 'ForOfStatement' && isChunkCall(ancestor.right),
  );
}

function decorated(fn) {
  const method = fn.parent?.type === 'MethodDefinition' ? fn.parent : undefined;
  return (method?.decorators ?? []).some((decorator) => CHUNK_NAME.test(decoratorName(decorator)));
}

function decoratorName(decorator) {
  const expression = unwrapped(decorator.expression);
  const callee = expression.type === 'CallExpression' ? unwrapped(expression.callee) : expression;
  return callee.type === 'Identifier' ? callee.name : '';
}

/** Whether the code around `call` checks the array's size or splits it into chunks first. */
export function isBounded(context, call, array) {
  const texts = sourcesOf(context, array);
  const functions = enclosingFunctions(call);
  return (
    chunkedLoop(call) ||
    functions.some(
      (fn) => checksSize(context, fn, texts) || chunkedCallback(context, fn) || decorated(fn),
    )
  );
}
