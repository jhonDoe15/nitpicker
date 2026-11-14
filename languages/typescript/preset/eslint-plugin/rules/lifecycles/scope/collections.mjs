import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { astChildren, isFunctionNode, unwrapExpression } from './close-scopes.mjs';

const ARRAY = 'Array';
const DELETE = 'delete';
const COLLECTION_TYPES = new Set(['Map', 'Set', ARRAY, 'Record']);
const ADDING = new Set(['set', 'add', 'push', 'unshift']);
const REMOVING = new Set([DELETE, 'clear', 'splice', 'shift', 'pop']);

function constructed(expression) {
  const value = unwrapExpression(expression);
  if (value.type === 'NewExpression' && value.callee.type === 'Identifier') {
    return COLLECTION_TYPES.has(value.callee.name) ? value.callee.name : undefined;
  }
  if (value.type === 'ArrayExpression') {
    return ARRAY;
  }
  return undefined;
}

function annotated(typeAnnotation) {
  const type = typeAnnotation?.typeAnnotation;
  const name = type?.typeName?.name;
  if (type?.type === 'TSTypeReference' && COLLECTION_TYPES.has(name)) {
    return name;
  }
  return type?.type === 'TSArrayType' ? ARRAY : undefined;
}

function fieldBindings(body) {
  const declared = body.body
    .filter((member) => member.type === 'PropertyDefinition' && !member.computed && !member.static)
    .map((member) => ({
      name: member.key.name,
      node: member,
      kind: (member.value && constructed(member.value)) ?? annotated(member.typeAnnotation),
    }));
  const assigned = [...depthFirst(body, astChildren)]
    .filter(
      (node) =>
        node.type === 'AssignmentExpression' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.type === 'ThisExpression' &&
        constructed(node.right) !== undefined &&
        ancestorsOf(node).find(isFunctionNode)?.parent.kind === 'constructor',
    )
    .map((node) => ({ name: node.left.property.name, node, kind: constructed(node.right) }));
  return [...declared, ...assigned].filter((binding) => binding.kind !== undefined);
}

function variableBindings(sourceCode, container) {
  const scope = sourceCode.scopeManager.acquire(container);
  return (scope?.variables ?? [])
    .map((variable) => {
      const definition = variable.defs.at(0);
      const init = definition?.type === 'Variable' ? definition.node.init : undefined;
      return init === undefined || init === null
        ? undefined
        : { name: variable.name, node: definition.node, variable, kind: constructed(init) };
    })
    .filter((binding) => binding?.kind !== undefined);
}

export function collectionsOf(sourceCode, container) {
  return container.type === 'ClassBody'
    ? fieldBindings(container)
    : variableBindings(sourceCode, container);
}

export function usesOf(binding, container) {
  if (binding.variable !== undefined) {
    return binding.variable.references.map((reference) => reference.identifier);
  }
  return [...depthFirst(container, astChildren)].filter(
    (node) =>
      node.type === 'MemberExpression' &&
      node.object.type === 'ThisExpression' &&
      ((!node.computed && node.property.name === binding.name) ||
        (node.computed &&
          node.property.type === 'Literal' &&
          node.property.value === binding.name)),
  );
}

function outer(use) {
  const chain = [use];
  for (const node of chain) {
    if (node.parent?.type === 'TSNonNullExpression' || node.parent?.type === 'ChainExpression') {
      chain.push(node.parent);
    }
  }
  return chain.at(-1);
}

function memberUse(parent) {
  const method = parent.property.name;
  const call = parent.parent;
  const isCall = call.type === 'CallExpression' && call.callee === parent;
  if (isCall && ADDING.has(method)) {
    return { kind: 'add', call, method };
  }
  if (isCall && REMOVING.has(method)) {
    return { kind: 'remove', call, method };
  }
  if (method === 'length' && call.type === 'AssignmentExpression') {
    return { kind: 'remove', call, method: 'length' };
  }
  return { kind: 'read', call: isCall ? call : undefined, method };
}

function indexedUse(parent) {
  const holder = parent.parent;
  if (holder.type === 'AssignmentExpression' && holder.left === parent) {
    return { kind: 'add', call: holder, method: 'index', key: parent.property };
  }
  if (holder.type === 'UnaryExpression' && holder.operator === DELETE) {
    return { kind: 'remove', call: holder, method: DELETE };
  }
  return { kind: 'read' };
}

export function useKind(use) {
  const target = outer(use);
  const { parent } = target;
  if (parent.type === 'MemberExpression' && parent.object === target) {
    return parent.computed ? indexedUse(parent) : memberUse(parent);
  }
  if (parent.type === 'AssignmentExpression' && parent.left === target) {
    return { kind: 'reassign', call: parent };
  }
  return { kind: 'escape', node: parent };
}

export function destructuredFromThis(body, name) {
  return [...depthFirst(body, astChildren)].some(
    (node) =>
      node.type === 'VariableDeclarator' &&
      node.init?.type === 'ThisExpression' &&
      node.id.type === 'ObjectPattern' &&
      node.id.properties.some((property) => property.key?.name === name),
  );
}
