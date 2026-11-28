import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Variable } from '../caches/scope-names.mts';
import { nameOf, scopeChain } from '../typed/node-views.mts';
import { unwrapOf } from '../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

export type { Variable };
export type Scope = TSESLint.Scope.Scope;
export type Definition = Variable['defs'][number];

const MODULES = new Set(['typescript']);
const MAX_ALIAS_DEPTH = 3;

function isRequireOf(node: TSESTree.Node | undefined): node is TSESTree.CallExpression {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require'
  );
}

export function isModuleLoad(node: TSESTree.Node | undefined): boolean {
  const unwrapped = unwrapOf(node, [AST_NODE_TYPES.AwaitExpression]);
  return isRequireOf(unwrapped) || unwrapped?.type === AST_NODE_TYPES.ImportExpression;
}

function isTypescriptRequire(node: TSESTree.Node | undefined): boolean {
  return (
    isRequireOf(node) &&
    node.arguments[0]?.type === AST_NODE_TYPES.Literal &&
    MODULES.has(String(node.arguments[0].value))
  );
}

function findVariable(scope: Scope, name: string): Variable | undefined {
  return scopeChain(scope)
    .map((current) => current.set.get(name))
    .find((variable) => variable !== undefined);
}

function patternKey(pattern: TSESTree.ObjectPattern, local: string): string | undefined {
  for (const property of pattern.properties) {
    if (
      property.type === AST_NODE_TYPES.Property &&
      !property.computed &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      property.value.type === AST_NODE_TYPES.Identifier &&
      property.value.name === local
    ) {
      return property.key.name;
    }
  }
  return undefined;
}

type Binding = { readonly namespace: true } | { readonly namespace: false; readonly name: string };

const NAMESPACE_BINDING: Binding = { namespace: true };

function specifierBinding(node: TSESTree.ImportSpecifier): Binding | undefined {
  const imported = nameOf(node.imported);
  return imported !== undefined &&
    node.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    MODULES.has(node.parent.source.value)
    ? { namespace: false, name: imported }
    : undefined;
}

type ImportNode = TSESLint.Scope.Definitions.ImportBindingDefinition['node'];

function importEqualsBinding(node: TSESTree.TSImportEqualsDeclaration): Binding | undefined {
  return node.moduleReference.type === AST_NODE_TYPES.TSExternalModuleReference &&
    MODULES.has(node.moduleReference.expression.value)
    ? NAMESPACE_BINDING
    : undefined;
}

function importBinding(node: ImportNode): Binding | undefined {
  if (node.type === AST_NODE_TYPES.ImportSpecifier) {
    return specifierBinding(node);
  }
  if (
    node.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
    node.type === AST_NODE_TYPES.ImportNamespaceSpecifier
  ) {
    return MODULES.has(node.parent.source.value) ? NAMESPACE_BINDING : undefined;
  }
  return importEqualsBinding(node);
}

type Alias = {
  readonly declarator: TSESTree.VariableDeclarator;
  readonly init: TSESTree.Expression;
  readonly local: string;
};

type Resolution = {
  readonly aliases: readonly Alias[];
  readonly root: Binding | undefined;
};

type Lookup = { readonly name: string; readonly scope: Scope; readonly depth: number };

type Step = {
  readonly alias: Alias | undefined;
  readonly root: Binding | undefined;
  readonly next: Lookup | undefined;
};

const ENDS_UNRESOLVED: Step = { alias: undefined, root: undefined, next: undefined };

function singleDefinition(variable: Variable | undefined): Definition | undefined {
  return variable?.defs.length === 1 ? variable.defs[0] : undefined;
}

function aliasOf(definition: Definition, local: string): Alias | undefined {
  const node = definition.node;
  return node.type === AST_NODE_TYPES.VariableDeclarator && node.init !== null
    ? { declarator: node, init: node.init, local }
    : undefined;
}

function stepOf(lookup: Lookup): Step {
  const variable = findVariable(lookup.scope, lookup.name);
  const definition = singleDefinition(variable);
  if (variable === undefined || definition === undefined) {
    return ENDS_UNRESOLVED;
  }
  if (definition.type === DefinitionType.ImportBinding) {
    return { ...ENDS_UNRESOLVED, root: importBinding(definition.node) };
  }
  const alias = aliasOf(definition, lookup.name);
  if (alias === undefined) {
    return ENDS_UNRESOLVED;
  }
  if (isTypescriptRequire(alias.init)) {
    return { ...ENDS_UNRESOLVED, alias, root: NAMESPACE_BINDING };
  }
  const next =
    alias.init.type === AST_NODE_TYPES.Identifier
      ? { name: alias.init.name, scope: variable.scope, depth: lookup.depth + 1 }
      : undefined;
  return { ...ENDS_UNRESOLVED, alias, next };
}

function resolution(name: string, scope: Scope): Resolution {
  const aliases: Alias[] = [];
  const pending: Lookup[] = [{ name, scope, depth: 0 }];
  for (const lookup of pending) {
    if (lookup.depth > MAX_ALIAS_DEPTH) {
      return { aliases, root: undefined };
    }
    const step = stepOf(lookup);
    if (step.alias !== undefined) {
      aliases.push(step.alias);
    }
    if (step.next === undefined) {
      return { aliases, root: step.root };
    }
    pending.push(step.next);
  }
  return { aliases, root: undefined };
}

function throughAlias(alias: Alias, from: Binding | undefined): Binding | undefined {
  const { id } = alias.declarator;
  if (from === undefined || id.type === AST_NODE_TYPES.Identifier) {
    return from;
  }
  if (id.type === AST_NODE_TYPES.ObjectPattern && from.namespace) {
    const key = patternKey(id, alias.local);
    return key === undefined ? undefined : { namespace: false, name: key };
  }
  return undefined;
}

function bindingOf(name: string, scope: Scope): Binding | undefined {
  const { aliases, root } = resolution(name, scope);
  return aliases.reduceRight<Binding | undefined>(
    (inner, alias) => throughAlias(alias, inner),
    root,
  );
}

function memberApiName(callee: TSESTree.MemberExpression, scope: Scope): string | undefined {
  return !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    bindingOf(callee.object.name, scope)?.namespace === true
    ? callee.property.name
    : undefined;
}

export function apiName(callee: TSESTree.Node, scope: Scope): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const binding = bindingOf(callee.name, scope);
    return binding?.namespace === false ? binding.name : undefined;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? memberApiName(callee, scope) : undefined;
}
