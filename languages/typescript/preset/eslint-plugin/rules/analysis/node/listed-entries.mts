import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, variableNamed } from '../../typed/node-views.mts';
import { importedCalleeName, type ModuleBindings } from '../subprocess-calls.mts';
import {
  hasUnsafeObjectReferences,
  isFsListing,
  safeIterationCallback,
  usesOrdinaryEncoding,
  type ListingScope,
} from './listed-entry-sources.mts';

type Scope = ListingScope & { readonly fs: ModuleBindings };
type Step = {
  readonly next?: TSESTree.Node | undefined;
  readonly directory?: TSESTree.Node | undefined;
};
type Key = readonly (string | TSESLint.Scope.Variable)[];
type Entry = { readonly variable: TSESLint.Scope.Variable; readonly collection: TSESTree.Node };

const { DefinitionType } = TSESLint.Scope;

const LISTING_FUNCTIONS = new Set(['readdir', 'readdirSync', 'opendir', 'opendirSync']);
const FILTER = 'filter';
const ORDER_KEEPING_CALLBACKS = [FILTER, 'sort', 'toSorted'];
const KEEPING_METHODS = new Set([...ORDER_KEEPING_CALLBACKS, 'slice', 'reverse', 'toReversed']);
const ENTRY_CALLBACK_PARAMETERS = 3;
const ITERATING_METHODS = new Set([
  'map',
  'forEach',
  FILTER,
  'flatMap',
  'some',
  'every',
  'find',
  'findLast',
]);
const MAX_STEPS = 20;
const ENTRY_DIRECTORIES = new Set(['parentPath', 'path']);

function unwrapped(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
    ? node.expression
    : undefined;
}

function inner(expression: TSESTree.Node): TSESTree.Node {
  const chain = [expression];
  for (const current of chain) {
    const next = unwrapped(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  return chain.at(-1) ?? expression;
}

function singleBinding(
  sourceCode: ListingScope['sourceCode'],
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const initialized =
    variable !== undefined &&
    definition?.type === DefinitionType.Variable &&
    writes.length === 1 &&
    !hasUnsafeObjectReferences(variable);
  return initialized ? (definition.node.init ?? undefined) : undefined;
}

function thenSource(
  sourceCode: ListingScope['sourceCode'],
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs.at(0);
  const callback = definition?.type === DefinitionType.Parameter ? definition.node : undefined;
  const call = callback?.parent;
  if (
    variable === undefined ||
    callback === undefined ||
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[0] !== callback ||
    callback.params[0] !== definition?.name ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    nameOf(call.callee.property) !== 'then'
  ) {
    return undefined;
  }
  return hasUnsafeObjectReferences(variable) ? undefined : call.callee.object;
}

function isEmptyArray(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ArrayExpression && node.elements.length === 0;
}

function branchStep(node: TSESTree.ConditionalExpression): Step {
  if (isEmptyArray(inner(node.alternate))) {
    return { next: node.consequent };
  }
  return { next: isEmptyArray(inner(node.consequent)) ? node.alternate : undefined };
}

function identifierStep(scope: Scope, node: TSESTree.Identifier): Step {
  const awaited = thenSource(scope.sourceCode, node);
  return { next: awaited ?? singleBinding(scope.sourceCode, node) };
}

function callStep(scope: Scope, node: TSESTree.CallExpression): Step {
  const listing = importedCalleeName(node.callee, scope.fs);
  if (
    listing !== undefined &&
    LISTING_FUNCTIONS.has(listing) &&
    isFsListing(scope, node) &&
    usesOrdinaryEncoding(node)
  ) {
    return { directory: node.arguments[0] };
  }
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return {};
  }
  const method = nameOf(callee.property);
  if (method === undefined || !KEEPING_METHODS.has(method)) {
    return {};
  }
  const callback = node.arguments[0];
  const safeCallback =
    callback === undefined ||
    !ORDER_KEEPING_CALLBACKS.includes(method) ||
    safeIterationCallback(scope.sourceCode, callback);
  return { next: safeCallback ? callee.object : undefined };
}

function listingStep(scope: Scope, expression: TSESTree.Node): Step {
  const node = inner(expression);
  if (node.type === AST_NODE_TYPES.Identifier) {
    return identifierStep(scope, node);
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return branchStep(node);
  }
  return node.type === AST_NODE_TYPES.CallExpression ? callStep(scope, node) : {};
}

function listedDirectoryOf(scope: Scope, expression: TSESTree.Node): TSESTree.Node | undefined {
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

function iteratedCollection(definition: TSESLint.Scope.Definition): TSESTree.Node | undefined {
  if (definition.type === DefinitionType.Variable) {
    const declaration = definition.parent;
    const loop = declaration.parent;
    const iterates = loop.type === AST_NODE_TYPES.ForOfStatement && loop.left === declaration;
    return iterates ? loop.right : undefined;
  }
  if (definition.type !== DefinitionType.Parameter) {
    return undefined;
  }
  const callback = definition.node;
  const call = callback.parent;
  const isFirstParameter = callback.params[0] === definition.name;
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[0] !== callback ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed
  ) {
    return undefined;
  }
  const method = nameOf(call.callee.property);
  const iterates =
    method !== undefined &&
    ITERATING_METHODS.has(method) &&
    callback.params.length < ENTRY_CALLBACK_PARAMETERS;
  return isFirstParameter && iterates ? call.callee.object : undefined;
}

function entryIdentifier(segment: TSESTree.Node): TSESTree.Identifier | undefined {
  const node = inner(segment);
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node;
  }
  const isName =
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    nameOf(node.property) === 'name';
  return isName && node.object.type === AST_NODE_TYPES.Identifier ? node.object : undefined;
}

function isUnreassigned(variable: TSESLint.Scope.Variable): boolean {
  const writes = variable.references.filter((reference) => reference.isWrite()).length;
  return writes <= (variable.defs.at(0)?.type === DefinitionType.Parameter ? 0 : 1);
}

function entryBinding(scope: Scope, segment: TSESTree.Node): Entry | undefined {
  const identifier = entryIdentifier(segment);
  const variable =
    identifier === undefined ? undefined : variableNamed(scope.sourceCode, identifier);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition === undefined || !isUnreassigned(variable)) {
    return undefined;
  }
  if (
    inner(segment).type === AST_NODE_TYPES.MemberExpression &&
    hasUnsafeObjectReferences(variable)
  ) {
    return undefined;
  }
  const collection = iteratedCollection(definition);
  return collection === undefined ? undefined : { variable, collection };
}

function stableKey(scope: Scope, expression: TSESTree.Node): Key | undefined {
  const names: string[] = [];
  const chain = [expression];
  for (const current of chain) {
    const node = inner(current);
    if (
      node.type === AST_NODE_TYPES.Literal &&
      typeof node.value === 'string' &&
      names.length === 0
    ) {
      return [node.type, node.value];
    }
    if (node.type === AST_NODE_TYPES.Identifier) {
      const variable = variableNamed(scope.sourceCode, node);
      const stable =
        variable !== undefined &&
        isUnreassigned(variable) &&
        (names.length === 0 || !hasUnsafeObjectReferences(variable));
      return stable ? [variable, ...names.toReversed()] : undefined;
    }
    if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
      return undefined;
    }
    names.push(node.property.name);
    chain.push(node.object);
  }
  return undefined;
}

function sameKey(left: Key | undefined, right: Key | undefined): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.length === right.length &&
    left.every((part, index) => part === right[index])
  );
}

function isEntryProperty(scope: Scope, base: TSESTree.Node, entry: Entry): boolean {
  const node = inner(base);
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    ENTRY_DIRECTORIES.has(node.property.name) &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    variableNamed(scope.sourceCode, node.object) === entry.variable
  );
}

export function isEntryOfListedBase(
  scope: Scope,
  base: TSESTree.Node | undefined,
  segment: TSESTree.Node,
): boolean {
  const entry = base === undefined ? undefined : entryBinding(scope, segment);
  const directory = entry === undefined ? undefined : listedDirectoryOf(scope, entry.collection);
  if (base === undefined || entry === undefined || directory === undefined) {
    return false;
  }
  return (
    (isEntryProperty(scope, base, entry) &&
      inner(segment).type === AST_NODE_TYPES.MemberExpression) ||
    sameKey(stableKey(scope, directory), stableKey(scope, base))
  );
}
