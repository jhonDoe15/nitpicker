import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';
import {
  ASSERTION_WRAPPERS,
  calleeNameOf,
  unwrapOf,
  unwrapped,
  type FunctionNode,
} from '../../typed/syntax-views.mts';

const CHILDREN_PROPERTIES = new Set(['children', 'namedChildren']);
const ITERATION_METHODS = new Set([
  'map',
  'forEach',
  'flatMap',
  'reduce',
  'reduceRight',
  'filter',
  'find',
  'findIndex',
  'some',
  'every',
  'at',
]);
const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function isChildrenMember(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  if (plain.type !== AST_NODE_TYPES.MemberExpression || plain.computed) {
    return false;
  }
  const property = nameOf(plain.property);
  return property !== undefined && CHILDREN_PROPERTIES.has(property);
}

function recordDestructuredChildren(pattern: TSESTree.ObjectPattern, aliases: Set<string>): void {
  for (const prop of pattern.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.computed) {
      continue;
    }
    const key = nameOf(prop.key);
    const local = nameOf(prop.value);
    if (key !== undefined && CHILDREN_PROPERTIES.has(key) && local !== undefined) {
      aliases.add(local);
    }
  }
}

function childrenAliasesOf(nodes: readonly TSESTree.Node[]): Set<string> {
  const aliases = new Set<string>();
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.VariableDeclarator || node.init === null) {
      continue;
    }
    if (node.id.type === AST_NODE_TYPES.Identifier && isChildrenMember(node.init)) {
      aliases.add(node.id.name);
    } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
      recordDestructuredChildren(node.id, aliases);
    }
  }
  return aliases;
}

function isChildrenSource(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  if (isChildrenMember(node)) {
    return true;
  }
  const plain = unwrapped(node);
  return plain.type === AST_NODE_TYPES.Identifier && aliases.has(plain.name);
}

function isChildrenIterationCall(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return false;
  }
  const method = nameOf(callee.property);
  return (
    method !== undefined &&
    ITERATION_METHODS.has(method) &&
    isChildrenSource(callee.object, aliases)
  );
}

function isChildrenForOf(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  return node.type === AST_NODE_TYPES.ForOfStatement && isChildrenSource(node.right, aliases);
}

function isChildrenIndexing(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.computed &&
    isChildrenSource(node.object, aliases)
  );
}

function isChildrenDestructuring(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  return (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.id.type === AST_NODE_TYPES.ArrayPattern &&
    node.init !== null &&
    isChildrenSource(node.init, aliases)
  );
}

function isDirectFieldChildChain(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.optional) {
    return false;
  }
  const target = unwrapOf(node.object, ASSERTION_WRAPPERS);
  return (
    target.type === AST_NODE_TYPES.CallExpression &&
    calleeNameOf(target.callee) === 'childForFieldName'
  );
}

function isUncheckedAccess(node: TSESTree.Node, aliases: ReadonlySet<string>): boolean {
  return (
    isChildrenIterationCall(node, aliases) ||
    isChildrenForOf(node, aliases) ||
    isChildrenIndexing(node, aliases) ||
    isChildrenDestructuring(node, aliases) ||
    isDirectFieldChildChain(node)
  );
}

export function firstUncheckedAccess(fn: FunctionNode): TSESTree.Node | undefined {
  const nodes = nodesWithoutNested(fn.body, FUNCTION_TYPES, nodeChildren);
  const aliases = childrenAliasesOf(nodes);
  return nodes.find((node) => isUncheckedAccess(node, aliases));
}
