import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { astChildren, isFunctionNode, unwrapExpression, type NonRoot } from './close-scopes.mts';

type Variable = TSESLint.Scope.Variable;
export type BindingNode =
  TSESTree.PropertyDefinition | TSESTree.AssignmentExpression | TSESTree.VariableDeclarator;
export type Binding = {
  readonly name: string | undefined;
  readonly node: BindingNode;
  readonly kind: string | undefined;
  readonly variable?: Variable;
};
type ReadUse = {
  readonly kind: 'read';
  readonly call?: TSESTree.CallExpression | undefined;
  readonly method?: string;
};
export type AddUse = {
  readonly kind: 'add';
  readonly call: TSESTree.CallExpression | TSESTree.AssignmentExpression;
  readonly method: string;
  readonly key?: TSESTree.Node;
};
type RemoveUse = {
  readonly kind: 'remove';
  readonly call: TSESTree.CallExpression | TSESTree.AssignmentExpression | TSESTree.UnaryExpression;
  readonly method: string;
};
type ReassignUse = { readonly kind: 'reassign'; readonly call: TSESTree.AssignmentExpression };
type EscapeUse = {
  readonly kind: 'escape';
  readonly node: TSESTree.Node;
  readonly call?: undefined;
};
export type Use = ReadUse | AddUse | RemoveUse | ReassignUse | EscapeUse;

const { DefinitionType } = TSESLint.Scope;

const ARRAY = 'Array';
const DELETE = 'delete';
const COLLECTION_TYPES = new Set<string>(['Map', 'Set', ARRAY, 'Record']);
const ADDING = new Set<string>(['set', 'add', 'push', 'unshift']);
const REMOVING = new Set<string>([DELETE, 'clear', 'splice', 'shift', 'pop']);

function constructed(expression: TSESTree.Node): string | undefined {
  const value = unwrapExpression(expression);
  if (
    value.type === AST_NODE_TYPES.NewExpression &&
    value.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return COLLECTION_TYPES.has(value.callee.name) ? value.callee.name : undefined;
  }
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return ARRAY;
  }
  return undefined;
}

function annotated(typeAnnotation: TSESTree.TSTypeAnnotation | undefined): string | undefined {
  const type = typeAnnotation?.typeAnnotation;
  const name = type?.type === AST_NODE_TYPES.TSTypeReference ? nameOf(type.typeName) : undefined;
  if (name !== undefined && COLLECTION_TYPES.has(name)) {
    return name;
  }
  return type?.type === AST_NODE_TYPES.TSArrayType ? ARRAY : undefined;
}

function isConstructorAssignment(
  node: TSESTree.Node,
): node is TSESTree.AssignmentExpression & { readonly left: TSESTree.MemberExpression } {
  if (
    node.type !== AST_NODE_TYPES.AssignmentExpression ||
    node.left.type !== AST_NODE_TYPES.MemberExpression ||
    node.left.object.type !== AST_NODE_TYPES.ThisExpression ||
    constructed(node.right) === undefined
  ) {
    return false;
  }
  const parent = ancestorsOf(node).find(isFunctionNode)?.parent;
  return parent?.type === AST_NODE_TYPES.MethodDefinition && parent.kind === 'constructor';
}

function fieldBindings(body: TSESTree.ClassBody): Binding[] {
  const declared = body.body.flatMap((member) =>
    member.type === AST_NODE_TYPES.PropertyDefinition && !member.computed && !member.static
      ? [
          {
            name: nameOf(member.key),
            node: member,
            kind: (member.value && constructed(member.value)) ?? annotated(member.typeAnnotation),
          },
        ]
      : [],
  );
  const assigned = [...depthFirst(body, astChildren)]
    .filter(isConstructorAssignment)
    .map((node) => ({ name: nameOf(node.left.property), node, kind: constructed(node.right) }));
  return [...declared, ...assigned].filter((binding) => binding.kind !== undefined);
}

function variableBindings(sourceCode: SourceCode, container: TSESTree.Node): Binding[] {
  const scope = sourceCode.scopeManager?.acquire(container);
  return (scope?.variables ?? []).flatMap((variable) => {
    const definition = variable.defs.at(0);
    if (definition?.type !== DefinitionType.Variable) {
      return [];
    }
    const { init } = definition.node;
    const kind = init === null ? undefined : constructed(init);
    return kind === undefined
      ? []
      : [{ name: variable.name, node: definition.node, variable, kind }];
  });
}

export function collectionsOf(sourceCode: SourceCode, container: TSESTree.Node): Binding[] {
  return container.type === AST_NODE_TYPES.ClassBody
    ? fieldBindings(container)
    : variableBindings(sourceCode, container);
}

export function usesOf(binding: Binding, container: TSESTree.Node): NonRoot[] {
  if (binding.variable !== undefined) {
    return binding.variable.references.map((reference) => reference.identifier);
  }
  return [...depthFirst(container, astChildren)].filter(
    (node): node is TSESTree.MemberExpression =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      ((!node.computed && nameOf(node.property) === binding.name) ||
        (node.computed &&
          node.property.type === AST_NODE_TYPES.Literal &&
          node.property.value === binding.name)),
  );
}

function outer(use: NonRoot): NonRoot {
  const chain = [use];
  for (const node of chain) {
    if (
      node.parent.type === AST_NODE_TYPES.TSNonNullExpression ||
      node.parent.type === AST_NODE_TYPES.ChainExpression
    ) {
      chain.push(node.parent);
    }
  }
  return chain.at(-1) ?? use;
}

function memberUse(parent: TSESTree.MemberExpression): Use {
  const method = nameOf(parent.property) ?? '';
  const call = parent.parent;
  const isCall = call.type === AST_NODE_TYPES.CallExpression && call.callee === parent;
  if (isCall && ADDING.has(method)) {
    return { kind: 'add', call, method };
  }
  if (isCall && REMOVING.has(method)) {
    return { kind: 'remove', call, method };
  }
  if (method === 'length' && call.type === AST_NODE_TYPES.AssignmentExpression) {
    return { kind: 'remove', call, method: 'length' };
  }
  return { kind: 'read', call: isCall ? call : undefined, method };
}

function indexedUse(parent: TSESTree.MemberExpression): Use {
  const holder = parent.parent;
  if (holder.type === AST_NODE_TYPES.AssignmentExpression && holder.left === parent) {
    return { kind: 'add', call: holder, method: 'index', key: parent.property };
  }
  if (holder.type === AST_NODE_TYPES.UnaryExpression && holder.operator === DELETE) {
    return { kind: 'remove', call: holder, method: DELETE };
  }
  return { kind: 'read' };
}

export function useKind(use: NonRoot): Use {
  const target = outer(use);
  const { parent } = target;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === target) {
    return parent.computed ? indexedUse(parent) : memberUse(parent);
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === target) {
    return { kind: 'reassign', call: parent };
  }
  return { kind: 'escape', node: parent };
}

export function destructuredFromThis(body: TSESTree.Node, name: string | undefined): boolean {
  return [...depthFirst(body, astChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.init?.type === AST_NODE_TYPES.ThisExpression &&
      node.id.type === AST_NODE_TYPES.ObjectPattern &&
      node.id.properties.some(
        (property) => property.type === AST_NODE_TYPES.Property && nameOf(property.key) === name,
      ),
  );
}
