import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { importedBindings, loadedModule } from '../../security/imported-names.mts';
import { DEPTHS, type Context, staticKey, unwrapped } from '../../security/security-values.mts';

export type ModuleReference = { readonly module: string; readonly name: string };

type Hop = { readonly next?: TSESTree.Node; readonly key?: string; readonly member?: string };

const { DefinitionType } = TSESLint.Scope;
const WHOLE_MODULE = 'default';

function destructuredName(pattern: TSESTree.Node, name: string): string | undefined {
  if (pattern.type !== AST_NODE_TYPES.ObjectPattern) {
    return undefined;
  }
  const property = pattern.properties.find(
    (entry) =>
      entry.type === AST_NODE_TYPES.Property &&
      entry.value.type === AST_NODE_TYPES.Identifier &&
      entry.value.name === name,
  );
  return property === undefined ? undefined : staticKey(property);
}

function aliasHop(context: Context, node: TSESTree.Identifier): Hop | undefined {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  if (definition?.type !== DefinitionType.Variable || !definition.node.init) {
    return undefined;
  }
  const { id, init } = definition.node;
  if (id.type === AST_NODE_TYPES.Identifier) {
    return { next: init };
  }
  const key = destructuredName(id, node.name);
  return key === undefined ? undefined : { next: init, key };
}

function hopOf(context: Context, node: TSESTree.Node): Hop | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return aliasHop(context, node);
  }
  const named =
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier;
  return named ? { next: node.object, member: node.property.name } : undefined;
}

function baseOf(context: Context, node: TSESTree.Node): ModuleReference | undefined {
  const module = loadedModule(node);
  if (module !== undefined) {
    return { module, name: WHOLE_MODULE };
  }
  return node.type === AST_NODE_TYPES.Identifier
    ? importedBindings(context.sourceCode.ast).get(node.name)
    : undefined;
}

type Step = { readonly node: TSESTree.Node; readonly parts: readonly string[] };

function referenceAt(base: ModuleReference, steps: readonly Step[]): ModuleReference {
  const head = base.name === WHOLE_MODULE ? [] : [base.name];
  const parts = [...steps].reverse().flatMap((step) => step.parts);
  return { module: base.module, name: [...head, ...parts].join('.') || WHOLE_MODULE };
}

export function moduleReference(
  context: Context,
  expression: TSESTree.Node,
): ModuleReference | undefined {
  const steps: Step[] = [{ node: unwrapped(expression), parts: [] }];
  for (const { node } of steps) {
    const base = baseOf(context, node);
    if (base !== undefined) {
      return referenceAt(base, steps);
    }
    const hop = hopOf(context, node);
    if (hop?.next === undefined || steps.length >= DEPTHS.length) {
      return undefined;
    }
    const parts = [hop.key, hop.member].filter((part) => part !== undefined);
    steps.push({ node: unwrapped(hop.next), parts });
  }
  return undefined;
}
