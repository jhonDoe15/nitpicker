import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../../typed/node-views.mts';
import { findVariable, stringValue, type SourceContext } from '../constant-resolution.mts';

type Wrapper =
  | TSESTree.TSAsExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSNonNullExpression
  | TSESTree.TSSatisfiesExpression;

const { DefinitionType } = TSESLint.Scope;

const PROCESS = 'process';
const PROCESS_MODULES = new Set([PROCESS, 'node:process']);
const GLOBAL_OBJECTS = ['globalThis', 'global', 'window', 'self'];
const MAX_CHAIN_LENGTH = 8;

function isWrapper(node: TSESTree.Node | undefined): node is Wrapper {
  return (
    node?.type === AST_NODE_TYPES.TSAsExpression ||
    node?.type === AST_NODE_TYPES.TSTypeAssertion ||
    node?.type === AST_NODE_TYPES.TSNonNullExpression ||
    node?.type === AST_NODE_TYPES.TSSatisfiesExpression
  );
}

export function isProcessModule(source: string | undefined): boolean {
  return source !== undefined && PROCESS_MODULES.has(source);
}

export function wrapperTop(node: TSESTree.Node): TSESTree.Node {
  return (
    chainOf<TSESTree.Node>(node, (current) =>
      isWrapper(current.parent) ? current.parent : undefined,
    ).at(-1) ?? node
  );
}

export function staticName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed) {
    return member.property.type === AST_NODE_TYPES.Identifier ? member.property.name : undefined;
  }
  return member.property.type === AST_NODE_TYPES.Literal
    ? String(member.property.value)
    : undefined;
}

export function propertyName(property: TSESTree.Property): string | undefined {
  const { key } = property;
  if (!property.computed) {
    return key.type === AST_NODE_TYPES.Identifier ? key.name : stringValue(key);
  }
  return stringValue(key);
}

function constantInit(
  context: SourceContext,
  node: TSESTree.Node,
): TSESTree.Expression | undefined {
  const variable =
    node.type === AST_NODE_TYPES.Identifier ? findVariable(context, node, node.name) : undefined;
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier
    ? (definition.node.init ?? undefined)
    : undefined;
}

function nextInChain(context: SourceContext, node: TSESTree.Node): TSESTree.Node | undefined {
  if (isWrapper(node)) {
    return node.expression;
  }
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return constantInit(context, node);
}

function valueChain(context: SourceContext, node: TSESTree.Node): TSESTree.Node[] {
  const chain = [node];
  for (const current of chain) {
    const next = chain.length < MAX_CHAIN_LENGTH ? nextInChain(context, current) : undefined;
    if (next !== undefined) {
      chain.push(next);
    }
  }
  return chain;
}

function isGlobalNamed(
  context: SourceContext,
  node: TSESTree.Node,
  names: readonly string[],
): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || !names.includes(node.name)) {
    return false;
  }
  const variable = findVariable(context, node, node.name);
  return variable === undefined || variable.defs.length === 0;
}

export function isGlobalObject(context: SourceContext, node: TSESTree.Node): boolean {
  return valueChain(context, node).some((step) => isGlobalNamed(context, step, GLOBAL_OBJECTS));
}

function isProcessImport(context: SourceContext, node: TSESTree.Identifier): boolean {
  const definition = findVariable(context, node, node.name)?.defs.at(0);
  return (
    definition?.type === DefinitionType.ImportBinding &&
    definition.node.type !== AST_NODE_TYPES.ImportSpecifier &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    definition.parent.importKind !== 'type' &&
    isProcessModule(definition.parent.source.value)
  );
}

function isModuleLoad(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'require'
  ) {
    return isProcessModule(stringValue(node.arguments[0]));
  }
  return node.type === AST_NODE_TYPES.ImportExpression && isProcessModule(stringValue(node.source));
}

function isProcessStep(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return isGlobalNamed(context, node, [PROCESS]) || isProcessImport(context, node);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return staticName(node) === PROCESS && isGlobalObject(context, node.object);
  }
  return isModuleLoad(node);
}

export function isProcessValue(context: SourceContext, node: TSESTree.Node): boolean {
  return valueChain(context, node).some((step) => isProcessStep(context, step));
}
