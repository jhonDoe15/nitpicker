import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mts';
import { isFixedCollection } from '../../concurrency/collections/fixed-collections.mts';
import { descendants } from '../../concurrency/io-origin.mts';
import {
  memberName,
  typeServices,
  unwrapped,
  type Context,
} from '../../security/security-values.mts';
import { ancestorsOf, isNode, nameOf } from '../../typed/node-views.mts';
import { chainSteps } from '../query-chains.mts';

type MaybeNode = TSESTree.Node | undefined;
type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
type RuntimeOptions = { readonly needsEvidence: boolean };

const { DefinitionType } = TSESLint.Scope;

const CHUNK_NAME = /chunk|batch|partition|paginat/iu;
const FLAT_MAP = 'flatMap';
const ARRAY_MAKERS = new Set<string | undefined>([
  'map',
  'filter',
  FLAT_MAP,
  'flat',
  'concat',
  'split',
  'toSorted',
  'toReversed',
]);
const ARRAY_STATICS = new Set<string | undefined>(['from', 'keys', 'values', 'entries']);
const SIZE_KEEPING = new Set<string | undefined>([
  'map',
  'filter',
  FLAT_MAP,
  'toSorted',
  'toReversed',
  'sort',
  'reverse',
]);
const ITERATING = new Set<string | undefined>([
  'map',
  'forEach',
  FLAT_MAP,
  'reduce',
  'every',
  'some',
]);
const ARRAY_ANNOTATIONS = new Set<string | undefined>([AST_NODE_TYPES.TSArrayType]);
const EVIDENT_TYPES: readonly AST_NODE_TYPES[] = [
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ArrayExpression,
];
const ARRAY_TYPE_NAMES = new Set<string | undefined>(['Array', 'ReadonlyArray']);
const SIZE_MEMBERS = new Set<string | undefined>(['length', 'size']);
const MAX_SOURCES = 6;
const EMPTY_CHECKS = new Set<string | undefined>([
  'isEmpty',
  'isNotEmpty',
  'isNonEmpty',
  'isEmptyArray',
]);
const QUERY_STEPS = new Set<string | undefined>([
  'selectFrom',
  'select',
  'from',
  'createQueryBuilder',
  'subQuery',
]);

function typeKind(context: Context, node: TSESTree.Node): 'tuple' | 'array' | undefined {
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

function annotationOf(
  context: Context,
  identifier: TSESTree.Identifier,
): TSESTree.TypeNode | undefined {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const name = definition?.name;
  const annotation =
    name?.type === AST_NODE_TYPES.Identifier ? name.typeAnnotation?.typeAnnotation : undefined;
  if (annotation?.type === AST_NODE_TYPES.TSTypeOperator) {
    return annotation.typeAnnotation;
  }
  return annotation;
}

function hasArrayAnnotation(context: Context, identifier: TSESTree.Identifier): boolean {
  const annotation = annotationOf(context, identifier);
  const reference =
    annotation?.type === AST_NODE_TYPES.TSTypeReference ? annotation.typeName : undefined;
  return ARRAY_ANNOTATIONS.has(annotation?.type) || ARRAY_TYPE_NAMES.has(nameOf(reference));
}

function constInit(context: Context, identifier: TSESTree.Identifier): MaybeNode {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const variable = definition?.type === DefinitionType.Variable ? definition : undefined;
  return variable?.node.id.type === AST_NODE_TYPES.Identifier && variable.parent.kind === 'const'
    ? unwrapped(variable.node.init ?? undefined)
    : undefined;
}

function isArrayMaking(node: MaybeNode): boolean {
  const target = unwrapped(node);
  if (target?.type === AST_NODE_TYPES.AwaitExpression) {
    return false;
  }
  if (target?.type === AST_NODE_TYPES.ArrayExpression) {
    return target.elements.some((element) => element?.type === AST_NODE_TYPES.SpreadElement);
  }
  const callee =
    target?.type === AST_NODE_TYPES.CallExpression ? unwrapped(target.callee) : undefined;
  if (callee?.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const owner = unwrapped(callee.object);
  const isStatic =
    owner.type === AST_NODE_TYPES.Identifier && ['Array', 'Object'].includes(owner.name);
  return isStatic ? ARRAY_STATICS.has(memberName(callee)) : ARRAY_MAKERS.has(memberName(callee));
}

function isSubquery(context: Context, node: TSESTree.Node): boolean {
  const target = unwrapped(node);
  if (isFunctionNode(target) || target.type === AST_NODE_TYPES.TaggedTemplateExpression) {
    return true;
  }
  const value =
    target.type === AST_NODE_TYPES.Identifier ? (constInit(context, target) ?? target) : target;
  return chainSteps(value).steps.some((step) => QUERY_STEPS.has(step.name));
}

/** Whether `node` holds an array whose length is only known at run time (not a literal or a fixed window). */
export function isRuntimeArray(
  context: Context,
  node: TSESTree.Node,
  { needsEvidence }: RuntimeOptions,
): boolean {
  const target = unwrapped(node);
  if (isSubquery(context, target) || isFixedCollection(context, target)) {
    return false;
  }
  if (target.type === AST_NODE_TYPES.ArrayExpression && !isArrayMaking(target)) {
    return false;
  }
  const kind = typeKind(context, target);
  if (kind !== undefined) {
    return kind === 'array';
  }
  if (!needsEvidence) {
    return EVIDENT_TYPES.includes(target.type);
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return hasArrayAnnotation(context, target) || isArrayMaking(constInit(context, target));
  }
  return isArrayMaking(target);
}

function sameSizeSource(node: MaybeNode): MaybeNode {
  if (node?.type === AST_NODE_TYPES.CallExpression) {
    const callee = unwrapped(node.callee);
    return callee.type === AST_NODE_TYPES.MemberExpression && SIZE_KEEPING.has(memberName(callee))
      ? unwrapped(callee.object)
      : undefined;
  }
  if (
    node?.type === AST_NODE_TYPES.ArrayExpression &&
    node.elements.length === 1 &&
    node.elements[0]?.type === AST_NODE_TYPES.SpreadElement
  ) {
    return unwrapped(node.elements[0].argument);
  }
  const set =
    node?.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Set'
      ? node
      : undefined;
  return set === undefined ? undefined : unwrapped(set.arguments[0]);
}

function sourcesOf(context: Context, node: TSESTree.Node): Set<string> {
  const pending: TSESTree.Node[] = [unwrapped(node)];
  for (const current of pending) {
    const next =
      current.type === AST_NODE_TYPES.Identifier
        ? constInit(context, current)
        : sameSizeSource(current);
    if (next !== undefined && pending.length < MAX_SOURCES) {
      pending.push(next);
    }
  }
  return new Set(pending.map((current) => context.sourceCode.getText(current)));
}

function enclosingFunctions(node: TSESTree.Node): FunctionNode[] {
  return ancestorsOf(node).filter(isFunctionNode);
}

function checksSize(context: Context, fn: FunctionNode, texts: Set<string>): boolean {
  return [...descendants(fn.body)]
    .filter(isNode)
    .some(
      (child) =>
        (child.type === AST_NODE_TYPES.MemberExpression &&
          SIZE_MEMBERS.has(memberName(child)) &&
          texts.has(context.sourceCode.getText(unwrapped(child.object)))) ||
        (child.type === AST_NODE_TYPES.CallExpression &&
          EMPTY_CHECKS.has(callName(child)) &&
          child.arguments.length === 1 &&
          texts.has(context.sourceCode.getText(unwrapped(child.arguments[0])))),
    );
}

function callName(call: TSESTree.CallExpression): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
}

function isChunkCall(node: MaybeNode): boolean {
  const target = unwrapped(node);
  return target?.type === AST_NODE_TYPES.CallExpression && CHUNK_NAME.test(callName(target) ?? '');
}

function chunkedCallback(context: Context, fn: FunctionNode): boolean {
  const call = fn.parent;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    !call.arguments.some((argument) => argument === fn)
  ) {
    return false;
  }
  if (isChunkCall(call)) {
    return true;
  }
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || !ITERATING.has(memberName(callee))) {
    return false;
  }
  const owner = unwrapped(callee.object);
  return (
    isChunkCall(owner) ||
    (owner.type === AST_NODE_TYPES.Identifier && isChunkCall(constInit(context, owner)))
  );
}

function chunkedLoop(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) => ancestor.type === AST_NODE_TYPES.ForOfStatement && isChunkCall(ancestor.right),
  );
}

function decorated(fn: FunctionNode): boolean {
  const method = fn.parent.type === AST_NODE_TYPES.MethodDefinition ? fn.parent : undefined;
  return (method?.decorators ?? []).some((decorator) => CHUNK_NAME.test(decoratorName(decorator)));
}

function decoratorName(decorator: TSESTree.Decorator): string {
  const expression = unwrapped(decorator.expression);
  const callee =
    expression.type === AST_NODE_TYPES.CallExpression ? unwrapped(expression.callee) : expression;
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : '';
}

/** Whether the code around `call` checks the array's size or splits it into chunks first. */
export function isBounded(
  context: Context,
  call: TSESTree.CallExpression,
  array: TSESTree.Node,
): boolean {
  const texts = sourcesOf(context, array);
  const functions = enclosingFunctions(call);
  return (
    chunkedLoop(call) ||
    functions.some(
      (fn) => checksSize(context, fn, texts) || chunkedCallback(context, fn) || decorated(fn),
    )
  );
}
