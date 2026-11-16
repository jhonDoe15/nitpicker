import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mts';
import { depthFirst, nodeChildren } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import {
  memberName,
  resolvedValue,
  typeServices,
  unwrapped,
  type Context,
} from '../security-values.mts';

export type Obligation = {
  readonly kind: 'text' | 'array';
  readonly node: TSESTree.Node | undefined;
};
type MethodCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };

const MAPPERS = new Set<string | undefined>(['map', 'flatMap']);
const PRESERVING = new Set<string | undefined>([
  'filter',
  'slice',
  'reverse',
  'sort',
  'toSorted',
  'toReversed',
  'flat',
]);
const ADDERS = new Map([
  ['push', 0],
  ['unshift', 0],
  ['splice', 2],
]);
const INDEX_CALLBACKS = new Set<string | undefined>([
  'map',
  'flatMap',
  'forEach',
  'filter',
  'some',
  'every',
  'find',
]);
const NUMERIC_MAPPERS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt']);
const NUMERIC_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike;

export function textOf(node: TSESTree.Node | undefined): Obligation {
  return { kind: 'text', node };
}

export function arrayOf(node: TSESTree.Node | undefined): Obligation {
  return { kind: 'array', node };
}

function isArrayFrom(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Array' &&
    memberName(callee) === 'from'
  );
}

export function isIndexParameter(context: Context, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  if (definition?.type !== TSESLint.Scope.DefinitionType.Parameter) {
    return false;
  }
  const fn = definition.node;
  const call = fn.parent;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const isCallback = isArrayFrom(call)
    ? call.arguments[1] === fn
    : INDEX_CALLBACKS.has(memberName(call.callee)) && call.arguments[0] === fn;
  return isCallback && fn.params[1] === definition.name;
}

function functionChildren(node: TSESTree.Node): TSESTree.Node[] {
  return nodeChildren(node).filter((value) => !isFunctionNode(value));
}

function callbackObligations(callback: TSESTree.Node | undefined): Obligation[] | undefined {
  if (!isFunctionNode(callback)) {
    const numeric =
      callback?.type === AST_NODE_TYPES.Identifier && NUMERIC_MAPPERS.has(callback.name);
    return numeric ? [] : undefined;
  }
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [textOf(callback.body)];
  }
  const returns = [...depthFirst(callback.body, functionChildren)].filter(
    (node) => node.type === AST_NODE_TYPES.ReturnStatement,
  );
  const valued = returns.length > 0 && returns.every((node) => node.argument !== null);
  return valued
    ? returns.flatMap((node) => (node.argument === null ? [] : [textOf(node.argument)]))
    : undefined;
}

function hasNumericElements(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  if (!(checker.isArrayType(type) || checker.isTupleType(type))) {
    return false;
  }
  const element = type.getNumberIndexType();
  const members = element?.isUnion() ? element.types : [element];
  return members.every((member) => member !== undefined && (member.flags & NUMERIC_FLAGS) !== 0);
}

function elementObligations(
  elements: TSESTree.ArrayExpression['elements'],
): Obligation[] | undefined {
  const present = elements.filter((element) => element !== null);
  if (present.length < elements.length) {
    return undefined;
  }
  return present.map((element) =>
    element.type === AST_NODE_TYPES.SpreadElement ? arrayOf(element.argument) : textOf(element),
  );
}

function referenceObligations(reference: TSESLint.Scope.Reference): Obligation[] | undefined {
  if (reference.isWrite()) {
    return reference.init === true ? [] : [arrayOf(reference.writeExpr ?? undefined)];
  }
  const member = reference.identifier.parent;
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== reference.identifier) {
    return undefined;
  }
  const owner = member.parent;
  const name = memberName(member);
  const adder = name === undefined ? undefined : ADDERS.get(name);
  if (
    owner.type === AST_NODE_TYPES.CallExpression &&
    owner.callee === member &&
    adder !== undefined
  ) {
    return elementObligations(owner.arguments.slice(adder));
  }
  if (owner.type === AST_NODE_TYPES.AssignmentExpression && owner.left === member) {
    return member.computed ? [textOf(owner.right)] : undefined;
  }
  return name === 'fill' ? undefined : [];
}

function localArrayObligations(
  context: Context,
  identifier: TSESTree.Identifier,
): Obligation[] | undefined {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const declarator =
    definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node : undefined;
  if (
    variable === undefined ||
    declarator?.id.type !== AST_NODE_TYPES.Identifier ||
    declarator.init === null
  ) {
    return undefined;
  }
  const parts = variable.references.map((reference) => referenceObligations(reference));
  const known = parts.filter((part) => part !== undefined);
  return known.length < parts.length ? undefined : [arrayOf(declarator.init), ...known.flat()];
}

function isMethodCall(node: TSESTree.Node): node is MethodCall {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression
  );
}

function methodObligations(call: MethodCall): Obligation[] | undefined {
  const name = memberName(call.callee);
  const [first, second] = call.arguments;
  if (isArrayFrom(call)) {
    return second === undefined ? [arrayOf(first)] : callbackObligations(second);
  }
  if (MAPPERS.has(name)) {
    return callbackObligations(first);
  }
  if (name === 'fill') {
    return first === undefined ? undefined : [textOf(first)];
  }
  return PRESERVING.has(name) ? [arrayOf(call.callee.object)] : undefined;
}

export function arrayObligations(
  context: Context,
  node: TSESTree.Node | undefined,
): Obligation[] | undefined {
  const start = unwrapped(node);
  if (start === undefined) {
    return undefined;
  }
  if (hasNumericElements(context, start)) {
    return [];
  }
  if (start.type === AST_NODE_TYPES.Identifier) {
    return localArrayObligations(context, start);
  }
  const target = resolvedValue(context, start);
  if (target?.type === AST_NODE_TYPES.ArrayExpression) {
    return elementObligations(target.elements);
  }
  return target !== undefined && isMethodCall(target) ? methodObligations(target) : undefined;
}
