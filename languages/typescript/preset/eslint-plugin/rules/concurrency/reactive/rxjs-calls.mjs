import {
  constantNumber,
  findVariable,
  isFunctionNode,
  resolveConstant,
} from '../../analysis/constant-resolution.mjs';
import { memberName } from '../../security/security-values.mjs';
import { descendants, skipped } from '../io-origin.mjs';

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
const LOOSE_TYPES = 3;
const MAX_DEPTH = 4;

function importedName(definition) {
  const isImport =
    definition?.type === 'ImportBinding' && RXJS_MODULES.has(definition.parent?.source?.value);
  if (!isImport) {
    return undefined;
  }
  const specifier = definition.node;
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return '*';
  }
  return specifier.type === 'ImportSpecifier' ? specifier.imported.name : undefined;
}

function bindingOf(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  return variable?.defs.length === 1 ? importedName(variable.defs[0]) : undefined;
}

export function rxjsName(context, callee) {
  const target = skipped(callee);
  if (target?.type === 'Identifier') {
    const name = bindingOf(context, target);
    return name === '*' ? undefined : name;
  }
  const namespace = target?.type === 'MemberExpression' ? skipped(target.object) : undefined;
  return namespace?.type === 'Identifier' && bindingOf(context, namespace) === '*'
    ? memberName(target)
    : undefined;
}

export function isUnlimited(context, node) {
  if (node === undefined || isFunctionNode(skipped(node))) {
    return true;
  }
  const target = skipped(resolveConstant(context, skipped(node)));
  const infinite =
    (target?.type === 'Identifier' &&
      target.name === 'Infinity' &&
      (findVariable(context, target, 'Infinity')?.defs.length ?? 0) === 0) ||
    (target?.type === 'MemberExpression' && memberName(target) === 'POSITIVE_INFINITY');
  return infinite || constantNumber(context, node) === Number.POSITIVE_INFINITY;
}

function typedCollection(context, node) {
  const services = context.sourceCode.parserServices;
  if (services?.program === null || services?.program === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  if ((type.flags & LOOSE_TYPES) !== 0) {
    return undefined;
  }
  const parts = type.isUnion() ? type.types : [type];
  return parts.some(
    (part) => checker.isArrayLikeType(part) || ITERABLES.has(part.getSymbol()?.getName() ?? ''),
  );
}

function isCollection(context, node) {
  const typed = typedCollection(context, node);
  if (typed !== undefined) {
    return typed;
  }
  const target = skipped(resolveConstant(context, skipped(node)));
  if (target?.type === 'ArrayExpression') {
    return true;
  }
  if (target?.type === 'CallExpression') {
    const callee = skipped(target.callee);
    return callee.type === 'MemberExpression' && ARRAY_RESULTS.has(memberName(callee));
  }
  return ['Identifier', 'MemberExpression'].includes(target?.type);
}

function creationSource(context, call) {
  const name = rxjsName(context, call.callee);
  const [first] = call.arguments;
  if (name === 'from' && call.arguments.length === 1 && isCollection(context, first)) {
    return first;
  }
  const spread = call.arguments.length === 1 && first.type === 'SpreadElement';
  return name === 'of' && spread ? first.argument : undefined;
}

function readsSize(node) {
  return [...descendants(node)].some(
    (child) => child.type === 'MemberExpression' && SIZES.has(memberName(child)),
  );
}

function groups(context, operator) {
  const name = rxjsName(context, operator.callee);
  if (WINDOWS.has(name)) {
    return operator.arguments.length > 0 && !operator.arguments.some(readsSize);
  }
  return GROUPS.has(name);
}

function piped(context, call, before) {
  const callee = skipped(call.callee);
  if (callee.type !== 'MemberExpression' || memberName(callee) !== 'pipe') {
    return undefined;
  }
  const operators = before === undefined ? call.arguments : call.arguments.slice(0, before);
  const grouped = operators.some(
    (operator) => operator.type === 'CallExpression' && groups(context, operator),
  );
  return grouped ? { grouped } : { source: callee.object };
}

function stepTarget(context, step, depth) {
  return step?.source === undefined || depth > MAX_DEPTH
    ? undefined
    : skipped(resolveConstant(context, skipped(step.source)));
}

function upstream(context, first) {
  const pending = [first];
  for (const step of pending) {
    const target = stepTarget(context, step, pending.length);
    const collection =
      target?.type === 'CallExpression' ? creationSource(context, target) : undefined;
    if (collection !== undefined) {
      return collection;
    }
    if (target?.type === 'CallExpression') {
      pending.push(piped(context, target, undefined));
    }
  }
  return undefined;
}

export function pipeSource(context, operator) {
  const pipe = operator.parent;
  const isArgument = pipe?.type === 'CallExpression' && pipe.arguments.includes(operator);
  return isArgument
    ? upstream(context, piped(context, pipe, pipe.arguments.indexOf(operator)))
    : undefined;
}
