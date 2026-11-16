import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  constantNumber,
  findVariable,
  isFunctionNode,
  resolveConstant,
} from '../../analysis/constant-resolution.mts';
import { memberName, typeServices, type Context } from '../../security/security-values.mts';
import { nameOf } from '../../typed/node-views.mts';
import { descendants, skipped } from '../io-origin.mts';

type Typed = 'yes' | 'no' | typeof UNKNOWN;
type Piped = { readonly grouped: true } | { readonly source: TSESTree.Node };

const { DefinitionType } = TSESLint.Scope;
const RXJS_MODULES = new Set(['rxjs', 'rxjs/operators']);
const ARRAY_RESULTS = new Set([
  'map',
  'filter',
  'flatMap',
  'flat',
  'slice',
  'concat',
  'toSorted',
  'toReversed',
  'sort',
  'reverse',
  'keys',
  'values',
  'entries',
  'from',
]);
const GROUPS = new Set([
  'bufferCount',
  'bufferTime',
  'buffer',
  'bufferToggle',
  'bufferWhen',
  'toArray',
  'windowCount',
  'windowTime',
  'reduce',
  'first',
  'last',
  'single',
  'count',
  'min',
  'max',
  'every',
  'isEmpty',
  'find',
  'findIndex',
  'elementAt',
]);
const WINDOWS = new Set(['take', 'takeLast']);
const SIZES = new Set(['length', 'size']);
const ITERABLES = new Set([
  'Set',
  'Map',
  'ReadonlySet',
  'ReadonlyMap',
  'Iterable',
  'IterableIterator',
]);
const UNKNOWN = 'unknown';
const LOOSE_TYPES = 3;
const MAX_DEPTH = 4;

function importedName(definition: TSESLint.Scope.Definition | undefined): string | undefined {
  if (
    definition?.type !== DefinitionType.ImportBinding ||
    definition.parent.type !== AST_NODE_TYPES.ImportDeclaration ||
    !RXJS_MODULES.has(definition.parent.source.value)
  ) {
    return undefined;
  }
  const specifier = definition.node;
  if (specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier) {
    return '*';
  }
  return specifier.type === AST_NODE_TYPES.ImportSpecifier ? nameOf(specifier.imported) : undefined;
}

function bindingOf(context: Context, identifier: TSESTree.Identifier): string | undefined {
  const variable = findVariable(context, identifier, identifier.name);
  return variable?.defs.length === 1 ? importedName(variable.defs[0]) : undefined;
}

export function rxjsName(context: Context, callee: TSESTree.Node): string | undefined {
  const target = skipped(callee);
  if (target.type === AST_NODE_TYPES.Identifier) {
    const name = bindingOf(context, target);
    return name === '*' ? undefined : name;
  }
  if (target.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const namespace = skipped(target.object);
  return namespace.type === AST_NODE_TYPES.Identifier && bindingOf(context, namespace) === '*'
    ? memberName(target)
    : undefined;
}

export function isUnlimited(context: Context, node: TSESTree.Node | undefined): boolean {
  if (node === undefined || isFunctionNode(skipped(node))) {
    return true;
  }
  const target = skipped(resolveConstant(context, skipped(node)));
  const infinite =
    (target?.type === AST_NODE_TYPES.Identifier &&
      target.name === 'Infinity' &&
      (findVariable(context, target, 'Infinity')?.defs.length ?? 0) === 0) ||
    (target?.type === AST_NODE_TYPES.MemberExpression &&
      memberName(target) === 'POSITIVE_INFINITY');
  return infinite || constantNumber(context, node) === Number.POSITIVE_INFINITY;
}

function typedCollection(context: Context, node: TSESTree.Node): Typed {
  const services = typeServices(context);
  if (services === undefined) {
    return UNKNOWN;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  if ((type.flags & LOOSE_TYPES) !== 0) {
    return UNKNOWN;
  }
  const parts = type.isUnion() ? type.types : [type];
  const collection = parts.some(
    (part) => checker.isArrayLikeType(part) || ITERABLES.has(part.getSymbol()?.getName() ?? ''),
  );
  return collection ? 'yes' : 'no';
}

function isCollection(context: Context, node: TSESTree.Node): boolean {
  const typed = typedCollection(context, node);
  if (typed !== UNKNOWN) {
    return typed === 'yes';
  }
  const target = skipped(resolveConstant(context, skipped(node)));
  if (target?.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  if (target?.type === AST_NODE_TYPES.CallExpression) {
    const callee = skipped(target.callee);
    return (
      callee.type === AST_NODE_TYPES.MemberExpression && ARRAY_RESULTS.has(memberName(callee) ?? '')
    );
  }
  return (
    target?.type === AST_NODE_TYPES.Identifier || target?.type === AST_NODE_TYPES.MemberExpression
  );
}

function creationSource(
  context: Context,
  call: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const name = rxjsName(context, call.callee);
  const [first] = call.arguments;
  if (first === undefined) {
    return undefined;
  }
  if (name === 'from' && call.arguments.length === 1 && isCollection(context, first)) {
    return first;
  }
  const spread = call.arguments.length === 1 && first.type === AST_NODE_TYPES.SpreadElement;
  return name === 'of' && spread ? first.argument : undefined;
}

function readsSize(node: TSESTree.Node): boolean {
  return [...descendants(node)].some(
    (child) => child.type === AST_NODE_TYPES.MemberExpression && SIZES.has(memberName(child) ?? ''),
  );
}

function groups(context: Context, operator: TSESTree.CallExpression): boolean {
  const name = rxjsName(context, operator.callee) ?? '';
  if (WINDOWS.has(name)) {
    return operator.arguments.length > 0 && !operator.arguments.some(readsSize);
  }
  return GROUPS.has(name);
}

function piped(
  context: Context,
  call: TSESTree.CallExpression,
  before: number | undefined,
): Piped | undefined {
  const callee = skipped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || memberName(callee) !== 'pipe') {
    return undefined;
  }
  const operators = before === undefined ? call.arguments : call.arguments.slice(0, before);
  const grouped = operators.some(
    (operator) => operator.type === AST_NODE_TYPES.CallExpression && groups(context, operator),
  );
  return grouped ? { grouped } : { source: callee.object };
}

function stepTarget(
  context: Context,
  step: Piped | undefined,
  depth: number,
): TSESTree.Node | undefined {
  return step === undefined || !('source' in step) || depth > MAX_DEPTH
    ? undefined
    : skipped(resolveConstant(context, skipped(step.source)));
}

function upstream(context: Context, first: Piped | undefined): TSESTree.Node | undefined {
  const pending = [first];
  for (const step of pending) {
    const target = stepTarget(context, step, pending.length);
    const collection =
      target?.type === AST_NODE_TYPES.CallExpression ? creationSource(context, target) : undefined;
    if (collection !== undefined) {
      return collection;
    }
    if (target?.type === AST_NODE_TYPES.CallExpression) {
      pending.push(piped(context, target, undefined));
    }
  }
  return undefined;
}

export function pipeSource(
  context: Context,
  operator: TSESTree.CallExpression,
): TSESTree.Node | undefined {
  const pipe = operator.parent;
  const isArgument =
    pipe.type === AST_NODE_TYPES.CallExpression && pipe.arguments.includes(operator);
  return isArgument
    ? upstream(context, piped(context, pipe, pipe.arguments.indexOf(operator)))
    : undefined;
}
