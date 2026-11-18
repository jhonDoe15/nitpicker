import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../../typed/node-views.mts';

export type Mutation = {
  readonly hook: TSESTree.CallExpression;
  readonly triggers: ReadonlyMap<
    TSESTree.Identifier | TSESTree.MemberExpression,
    'mutate' | 'mutateAsync'
  >;
  readonly looseUses: boolean;
  readonly failureRead: boolean;
};

const readNames = new Set(['error', 'isError', 'status', 'failureReason', 'isIdle']);
const triggerNames = new Set(['mutate', 'mutateAsync']);
const harmlessNames = new Set([
  'isPending',
  'isLoading',
  'isSuccess',
  'data',
  'reset',
  'variables',
]);

type Trigger = 'mutate' | 'mutateAsync';

function isTrigger(name: string | undefined): name is Trigger {
  return name === 'mutate' || name === 'mutateAsync';
}

function calleeReferences(
  variable: TSESLint.Scope.Variable,
  kind: Trigger,
  found: Map<TSESTree.Identifier | TSESTree.MemberExpression, Trigger>,
): boolean {
  let loose = false;
  for (const reference of variable.references) {
    const { identifier, init } = reference;
    if (init === true || identifier.type !== AST_NODE_TYPES.Identifier) {
      continue;
    }
    const parent = identifier.parent;
    if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier) {
      found.set(identifier, kind);
    } else {
      loose = true;
    }
  }
  return loose;
}

type Reading = { readonly failureRead: boolean; readonly loose: boolean };
type Found = Map<TSESTree.Identifier | TSESTree.MemberExpression, Trigger>;
type Site = {
  readonly sourceCode: SourceCode;
  readonly declarator: TSESTree.VariableDeclarator;
  readonly hook: TSESTree.CallExpression;
};

const UNREAD: Reading = { failureRead: false, loose: false };
const FAILURE_READ: Reading = { failureRead: true, loose: false };

function readProperty(
  property: TSESTree.ObjectPattern['properties'][number],
  variables: readonly TSESLint.Scope.Variable[],
  found: Found,
): Reading {
  if (property.type !== AST_NODE_TYPES.Property || property.computed) {
    return FAILURE_READ;
  }
  const key = nameOf(property.key);
  const target =
    property.value.type === AST_NODE_TYPES.AssignmentPattern ? property.value.left : property.value;
  if (readNames.has(key ?? '')) {
    return FAILURE_READ;
  }
  if (isTrigger(key) && target.type === AST_NODE_TYPES.Identifier) {
    const variable = variables.find(({ name }) => name === target.name);
    return {
      failureRead: false,
      loose: variable !== undefined && calleeReferences(variable, key, found),
    };
  }
  return { failureRead: false, loose: key === undefined };
}

function patternBinding(site: Site, pattern: TSESTree.ObjectPattern): Mutation {
  const found: Found = new Map();
  const variables = site.sourceCode.getDeclaredVariables(site.declarator);
  const readings = pattern.properties.map((property) => readProperty(property, variables, found));
  return {
    hook: site.hook,
    triggers: found,
    looseUses: readings.some(({ loose }) => loose),
    failureRead: readings.some(({ failureRead }) => failureRead),
  };
}

function readUse(reference: TSESLint.Scope.Reference, found: Found): Reading {
  const { identifier } = reference;
  const parent = identifier.parent;
  if (reference.init === true) {
    return UNREAD;
  }
  if (
    parent.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== identifier ||
    parent.computed
  ) {
    return FAILURE_READ;
  }
  const name = nameOf(parent.property);
  const call = parent.parent;
  if (isTrigger(name) && call.type === AST_NODE_TYPES.CallExpression && call.callee === parent) {
    found.set(parent, name);
    return UNREAD;
  }
  if (isTrigger(name)) {
    return { failureRead: false, loose: true };
  }
  return { failureRead: readNames.has(name ?? '') || !harmlessNames.has(name ?? ''), loose: false };
}

function wholeBinding(site: Site, id: TSESTree.Identifier): Mutation {
  const found: Found = new Map();
  const variable = site.sourceCode
    .getDeclaredVariables(site.declarator)
    .find(({ name }) => name === id.name);
  const readings = (variable?.references ?? []).map((reference) => readUse(reference, found));
  return {
    hook: site.hook,
    triggers: found,
    looseUses: readings.some(({ loose }) => loose),
    failureRead: readings.some(({ failureRead }) => failureRead),
  };
}

export function mutationBinding(
  sourceCode: SourceCode,
  declarator: TSESTree.VariableDeclarator,
  hook: TSESTree.CallExpression,
): Mutation | undefined {
  const site = { sourceCode, declarator, hook };
  if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
    return patternBinding(site, declarator.id);
  }
  return declarator.id.type === AST_NODE_TYPES.Identifier
    ? wholeBinding(site, declarator.id)
    : undefined;
}
