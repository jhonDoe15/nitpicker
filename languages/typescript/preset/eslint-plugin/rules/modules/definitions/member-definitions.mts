import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { chainOf, depthFirst } from '../../typed/node-views.mts';

const { DefinitionType } = TSESLint.Scope;
const GLOBAL_OBJECT = 'Object';
const DESCRIPTOR_CALLS = new Set(['assign', 'defineProperty', 'defineProperties']);
const FRESH_VALUES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassExpression,
]);
const DEFINITION_LEAVES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.ClassExpression,
  AST_NODE_TYPES.Literal,
]);

function lastOf(start: TSESTree.Node, next: (node: TSESTree.Node) => TSESTree.Node | undefined) {
  return chainOf(start, next).at(-1) ?? start;
}

function isStaticChain(node: TSESTree.Node): boolean {
  const end = lastOf(node, (current) =>
    current.type === AST_NODE_TYPES.MemberExpression && !current.computed
      ? current.object
      : undefined,
  );
  return end.type === AST_NODE_TYPES.Identifier;
}

function isPlainKey(property: TSESTree.Property | TSESTree.MemberExpression): boolean {
  const key = property.type === AST_NODE_TYPES.Property ? property.key : property.property;
  return (
    !property.computed ||
    key.type === AST_NODE_TYPES.Literal ||
    key.type === AST_NODE_TYPES.Identifier ||
    isStaticChain(key)
  );
}

function memberRoot(node: TSESTree.Node): TSESTree.Identifier | undefined {
  const end = lastOf(node, (current) =>
    current.type === AST_NODE_TYPES.MemberExpression && isPlainKey(current)
      ? current.object
      : undefined,
  );
  return end.type === AST_NODE_TYPES.Identifier ? end : undefined;
}

function assignmentChain(node: TSESTree.Node): TSESTree.Node[] {
  return chainOf(node, (current) =>
    current.type === AST_NODE_TYPES.AssignmentExpression ? current.right : undefined,
  );
}

function isFreshObject(init: TSESTree.Node): boolean {
  const value = assignmentChain(init).at(-1) ?? init;
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return FRESH_VALUES.has(value.type);
  }
  const { callee } = value;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    memberRoot(callee)?.name === GLOBAL_OBJECT &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'create'
  );
}

function isTopLevel(variable: TSESLint.Scope.Variable): boolean {
  return variable.scope.block.type === AST_NODE_TYPES.Program;
}

function isLocalDefinition(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.at(0);
  if (variable === undefined || definition === undefined || !isTopLevel(variable)) {
    return false;
  }
  if (
    definition.type === DefinitionType.FunctionName ||
    definition.type === DefinitionType.ClassName
  ) {
    return true;
  }
  return (
    definition.type === DefinitionType.Variable &&
    definition.node.init !== null &&
    isFreshObject(definition.node.init)
  );
}

function isLocalMember(context: SourceContext, node: TSESTree.Node): boolean {
  const root = memberRoot(node);
  return root !== undefined && isLocalDefinition(context, root);
}

function isDefinitionLeaf(context: SourceContext, value: TSESTree.Node): boolean {
  if (value.type === AST_NODE_TYPES.Identifier || value.type === AST_NODE_TYPES.MemberExpression) {
    return isLocalMember(context, value);
  }
  return DEFINITION_LEAVES.has(value.type);
}

function nestedValues(node: TSESTree.Node): TSESTree.Node[] {
  return node.type === AST_NODE_TYPES.ObjectExpression
    ? node.properties.map((property) =>
        property.type === AST_NODE_TYPES.Property ? property.value : property,
      )
    : [];
}

function isDefinitionPart(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties.every(
      (property) => property.type === AST_NODE_TYPES.Property && isPlainKey(property),
    );
  }
  return isDefinitionLeaf(context, node);
}

function isDefinitionValue(context: SourceContext, value: TSESTree.Node): boolean {
  return [...depthFirst(value, nestedValues)].every((node) => isDefinitionPart(context, node));
}

function isDescriptorCall(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const [target, ...rest] = call.arguments;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === GLOBAL_OBJECT &&
    (findVariable(context, callee.object, GLOBAL_OBJECT)?.defs.length ?? 0) === 0 &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    DESCRIPTOR_CALLS.has(callee.property.name) &&
    target !== undefined &&
    isLocalMember(context, target) &&
    rest.every((argument) => isDefinitionValue(context, argument))
  );
}

function isMemberAssignment(context: SourceContext, node: TSESTree.AssignmentExpression): boolean {
  return (
    node.operator === '=' &&
    node.left.type === AST_NODE_TYPES.MemberExpression &&
    isLocalMember(context, node.left)
  );
}

function isMemberAssignmentLink(context: SourceContext, node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.AssignmentExpression && isMemberAssignment(context, node);
}

export function isMemberDefinition(context: SourceContext, expression: TSESTree.Node): boolean {
  if (expression.type === AST_NODE_TYPES.CallExpression) {
    return isDescriptorCall(context, expression);
  }
  const chain = assignmentChain(expression);
  const value = chain.at(-1);
  const links = chain.slice(0, -1);
  return (
    value !== undefined &&
    links.length > 0 &&
    links.every((link) => isMemberAssignmentLink(context, link)) &&
    isDefinitionValue(context, value)
  );
}
