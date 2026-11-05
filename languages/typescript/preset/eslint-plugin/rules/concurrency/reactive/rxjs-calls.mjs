import {
  constantNumber,
  findVariable,
  isFunctionNode,
  resolveConstant,
} from '../../analysis/constant-resolution.mjs';
import { memberName } from '../../security/security-values.mjs';
import { skipped } from '../io-origin.mjs';

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
  'take',
  'takeLast',
]);
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

function piped(context, call, before) {
  const callee = skipped(call.callee);
  if (callee.type !== 'MemberExpression' || memberName(callee) !== 'pipe') {
    return undefined;
  }
  const operators = before === undefined ? call.arguments : call.arguments.slice(0, before);
  const grouped = operators.some(
    (operator) =>
      operator.type === 'CallExpression' && GROUPS.has(rxjsName(context, operator.callee)),
  );
  return grouped ? { grouped } : { source: callee.object };
}

export function pipeSource(context, operator) {
  const pipe = operator.parent;
  const isArgument = pipe?.type === 'CallExpression' && pipe.arguments.includes(operator);
  let step = isArgument ? piped(context, pipe, pipe.arguments.indexOf(operator)) : undefined;
  for (let depth = 0; step?.source !== undefined && depth < MAX_DEPTH; depth += 1) {
    const target = skipped(resolveConstant(context, skipped(step.source)));
    if (target?.type !== 'CallExpression') {
      return undefined;
    }
    const collection = creationSource(context, target);
    if (collection !== undefined) {
      return collection;
    }
    step = piped(context, target, undefined);
  }
  return undefined;
}
