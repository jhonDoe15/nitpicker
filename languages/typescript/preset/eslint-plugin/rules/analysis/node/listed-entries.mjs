import { variableNamed } from '../ancestry.mjs';
import { importedCalleeName } from '../subprocess-calls.mjs';

const LISTING_FUNCTIONS = new Set(['readdir', 'readdirSync', 'opendir', 'opendirSync']);
const KEEPING_METHODS = new Set(['filter', 'sort', 'toSorted', 'slice', 'reverse', 'toReversed']);
const ITERATING_METHODS = new Set([
  'map',
  'forEach',
  'filter',
  'flatMap',
  'some',
  'every',
  'find',
  'findLast',
]);
const WRAPPERS = new Set([
  'AwaitExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);
const MAX_STEPS = 20;
const ENTRY_DIRECTORIES = new Set(['parentPath', 'path']);

function inner(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (WRAPPERS.has(current.type)) {
      chain.push(current.expression ?? current.argument);
    }
  }
  return chain.at(-1);
}

const MUTATING_METHODS = new Set([
  'push',
  'unshift',
  'splice',
  'fill',
  'copyWithin',
  'pop',
  'shift',
]);

function isMutatedInPlace(variable) {
  return variable.references.some(({ identifier }) => {
    const member = identifier.parent;
    if (member?.type !== 'MemberExpression' || member.object !== identifier) {
      return false;
    }
    const owner = member.parent;
    const calls = owner?.type === 'CallExpression' && owner.callee === member;
    const assigns = owner?.type === 'AssignmentExpression' && owner.left === member;
    return assigns || (calls && MUTATING_METHODS.has(member.property.name));
  });
}

function singleBinding(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const initialized =
    definition?.type === 'Variable' && writes.length === 1 && !isMutatedInPlace(variable);
  return initialized ? (definition.node.init ?? undefined) : undefined;
}

function thenSource(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  const callback = definition?.type === 'Parameter' ? definition.node : undefined;
  const call = callback?.parent;
  const isThen =
    call?.type === 'CallExpression' &&
    call.arguments[0] === callback &&
    callback.params[0] === definition.name &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.property.name === 'then';
  return isThen ? call.callee.object : undefined;
}

function isEmptyArray(node) {
  return node.type === 'ArrayExpression' && node.elements.length === 0;
}

function branchStep(node) {
  if (isEmptyArray(inner(node.alternate))) {
    return { next: node.consequent };
  }
  return { next: isEmptyArray(inner(node.consequent)) ? node.alternate : undefined };
}

function identifierStep(scope, node) {
  const awaited = thenSource(scope.sourceCode, node);
  return { next: awaited ?? singleBinding(scope.sourceCode, node) };
}

function callStep(scope, node) {
  if (LISTING_FUNCTIONS.has(importedCalleeName(node.callee, scope.fs))) {
    return { directory: node.arguments[0] };
  }
  const kept =
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    KEEPING_METHODS.has(node.callee.property.name);
  return { next: kept ? node.callee.object : undefined };
}

function listingStep(scope, expression) {
  const node = inner(expression);
  if (node.type === 'Identifier') {
    return identifierStep(scope, node);
  }
  if (node.type === 'ConditionalExpression') {
    return branchStep(node);
  }
  return node.type === 'CallExpression' ? callStep(scope, node) : {};
}

function listedDirectoryOf(scope, expression) {
  const chain = [expression];
  for (const current of chain) {
    if (chain.length > MAX_STEPS) {
      return undefined;
    }
    const { directory, next } = listingStep(scope, current);
    if (next === undefined) {
      return directory;
    }
    chain.push(next);
  }
  return undefined;
}

function iteratedCollection(definition) {
  if (definition.type === 'Variable') {
    const declaration = definition.parent;
    const loop = declaration?.parent;
    const iterates = loop?.type === 'ForOfStatement' && loop.left === declaration;
    return iterates ? loop.right : undefined;
  }
  if (definition.type !== 'Parameter') {
    return undefined;
  }
  const callback = definition.node;
  const call = callback.parent;
  const isFirstParameter = callback.params[0] === definition.name;
  const iterates =
    call?.type === 'CallExpression' &&
    call.arguments[0] === callback &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    ITERATING_METHODS.has(call.callee.property.name);
  return isFirstParameter && iterates ? call.callee.object : undefined;
}

function entryIdentifier(segment) {
  const node = inner(segment);
  if (node.type === 'Identifier') {
    return node;
  }
  const isName =
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.property.name === 'name';
  return isName ? node.object : undefined;
}

function isUnreassigned(variable) {
  const writes = variable.references.filter((reference) => reference.isWrite()).length;
  return writes <= (variable.defs.at(0)?.type === 'Parameter' ? 0 : 1);
}

function entryBinding(scope, segment) {
  const identifier = entryIdentifier(segment);
  const variable =
    identifier === undefined ? undefined : variableNamed(scope.sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition === undefined || !isUnreassigned(variable)) {
    return undefined;
  }
  const collection = iteratedCollection(definition);
  return collection === undefined ? undefined : { variable, collection };
}

function stableKey(scope, expression) {
  const names = [];
  const chain = [expression];
  for (const current of chain) {
    const node = inner(current);
    if (node.type === 'Identifier') {
      const variable = variableNamed(scope.sourceCode, node);
      const stable = variable !== undefined && isUnreassigned(variable);
      return stable ? [variable, ...names.toReversed()] : undefined;
    }
    if (node.type !== 'MemberExpression' || node.computed) {
      return undefined;
    }
    names.push(node.property.name);
    chain.push(node.object);
  }
  return undefined;
}

function sameKey(left, right) {
  return (
    left !== undefined &&
    right !== undefined &&
    left.length === right.length &&
    left.every((part, index) => part === right[index])
  );
}

function isEntryProperty(scope, base, entry) {
  const node = inner(base);
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    ENTRY_DIRECTORIES.has(node.property.name) &&
    node.object.type === 'Identifier' &&
    variableNamed(scope.sourceCode, node.object) === entry.variable
  );
}

export function isEntryOfListedBase(scope, base, segment) {
  const entry = base === undefined ? undefined : entryBinding(scope, segment);
  const directory = entry === undefined ? undefined : listedDirectoryOf(scope, entry.collection);
  if (directory === undefined) {
    return false;
  }
  return (
    (isEntryProperty(scope, base, entry) && inner(segment).type === 'MemberExpression') ||
    sameKey(stableKey(scope, directory), stableKey(scope, base))
  );
}
