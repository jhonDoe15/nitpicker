import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, stringValue, type SourceContext } from '../analysis/constant-resolution.mts';
import { isIdentifierNamed } from '../typed/node-views.mts';

type Wrapper =
  | TSESTree.TSNonNullExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.ChainExpression;
type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;

const { DefinitionType } = TSESLint.Scope;

const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);

function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
  );
}

export function bare(node: TSESTree.Node): TSESTree.Node {
  const chain = [node];
  for (const current of chain) {
    if (isWrapper(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

function keyName(computed: boolean, key: TSESTree.Node): string | undefined {
  if (!computed) {
    return key.type === AST_NODE_TYPES.Identifier ? key.name : stringValue(key);
  }
  return stringValue(key);
}

function propertyName(node: TSESTree.MemberExpression): string | undefined {
  return keyName(node.computed, node.property);
}

function isGlobal(context: SourceContext, node: TSESTree.Node, name: string): boolean {
  return (
    isIdentifierNamed(node, name) && (findVariable(context, node, name)?.defs.length ?? 0) === 0
  );
}

function isProcess(context: SourceContext, node: TSESTree.Node): boolean {
  return (
    isGlobal(context, node, 'process') ||
    (node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      propertyName(node) === 'process')
  );
}

function constDefinition(
  context: SourceContext,
  node: TSESTree.Identifier,
): VariableDefinition | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable && definition.parent.kind === 'const'
    ? definition
    : undefined;
}

function isDirectEnvObject(context: SourceContext, node: TSESTree.Node): boolean {
  const plain = bare(node);
  if (plain.type !== AST_NODE_TYPES.MemberExpression || propertyName(plain) !== 'env') {
    return false;
  }
  const owner = bare(plain.object);
  return (
    isProcess(context, owner) ||
    isGlobal(context, owner, 'Bun') ||
    (owner.type === AST_NODE_TYPES.MetaProperty && owner.meta.name === 'import')
  );
}

export function isEnvObject(context: SourceContext, node: TSESTree.Node): boolean {
  const plain = bare(node);
  if (plain.type !== AST_NODE_TYPES.Identifier) {
    return isDirectEnvObject(context, plain);
  }
  const definition = constDefinition(context, plain);
  return (
    definition?.node.id.type === AST_NODE_TYPES.Identifier &&
    definition.node.init !== null &&
    isDirectEnvObject(context, definition.node.init)
  );
}

function isDenoGet(context: SourceContext, node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'get' &&
    callee.object.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee.object) === 'env' &&
    isGlobal(context, callee.object.object, 'Deno') &&
    node.arguments.length === 1
  );
}

function envVariableOf(context: SourceContext, node: TSESTree.Node): string | undefined {
  const plain = bare(node);
  if (plain.type === AST_NODE_TYPES.MemberExpression && isEnvObject(context, plain.object)) {
    return propertyName(plain);
  }
  return plain.type === AST_NODE_TYPES.CallExpression && isDenoGet(context, plain)
    ? stringValue(plain.arguments[0])
    : undefined;
}

export function destructuredKey(property: TSESTree.Property): string | undefined {
  return keyName(property.computed, property.key);
}

function destructuredName(
  context: SourceContext,
  definition: VariableDefinition,
): string | undefined {
  const { node } = definition;
  if (node.id.type !== AST_NODE_TYPES.ObjectPattern) {
    return undefined;
  }
  const entry = node.id.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property && property.value === definition.name,
  );
  return entry !== undefined && node.init !== null && isEnvObject(context, node.init)
    ? destructuredKey(entry)
    : undefined;
}

function aliasedVariable(context: SourceContext, node: TSESTree.Identifier): string | undefined {
  const definition = constDefinition(context, node);
  if (definition === undefined) {
    return undefined;
  }
  if (definition.node.id.type === AST_NODE_TYPES.Identifier) {
    return definition.node.init === null ? undefined : envVariableOf(context, definition.node.init);
  }
  return destructuredName(context, definition);
}

export function envSubject(context: SourceContext, node: TSESTree.Node): string | undefined {
  const plain = bare(node);
  return (
    envVariableOf(context, plain) ??
    (plain.type === AST_NODE_TYPES.Identifier ? aliasedVariable(context, plain) : undefined)
  );
}
