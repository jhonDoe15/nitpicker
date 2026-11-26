import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { ancestorsOf, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { isExported } from '../typed/syntax-views.mts';

const MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
]);
const VIEWS = new Set(['values', 'keys', 'entries']);
const MODULE_SCOPES = new Set(['module', 'global']);

function writtenOut(value: TSESTree.Node | null | undefined): boolean {
  if (
    value?.type === AST_NODE_TYPES.ArrayExpression ||
    value?.type === AST_NODE_TYPES.ObjectExpression
  ) {
    return true;
  }
  const [first] = value?.type === AST_NODE_TYPES.NewExpression ? value.arguments : [];
  return first?.type === AST_NODE_TYPES.ArrayExpression;
}

function withoutView(node: TSESTree.Node): TSESTree.Node {
  const inner = node.type === AST_NODE_TYPES.ArrayExpression ? node.elements[0] : node;
  const spread = inner?.type === AST_NODE_TYPES.SpreadElement ? inner.argument : inner;
  if (
    spread?.type === AST_NODE_TYPES.CallExpression &&
    spread.arguments.length === 0 &&
    spread.callee.type === AST_NODE_TYPES.MemberExpression &&
    VIEWS.has(nameOf(spread.callee.property) ?? '')
  ) {
    return spread.callee.object;
  }
  return spread ?? node;
}

function handedOn(access: TSESTree.Node): boolean {
  const { parent } = access;
  return (
    (parent?.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.some((arg) => arg === access)) ||
    (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === access) ||
    (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.right === access)
  );
}

function elementWritten(access: TSESTree.Node): boolean {
  const { parent } = access;
  if (parent?.type !== AST_NODE_TYPES.MemberExpression || parent.object !== access) {
    return false;
  }
  const outer = parent.parent;
  return (
    (outer.type === AST_NODE_TYPES.AssignmentExpression && outer.left === parent) ||
    (outer.type === AST_NODE_TYPES.UpdateExpression && outer.argument === parent) ||
    (outer.type === AST_NODE_TYPES.UnaryExpression && outer.operator === 'delete')
  );
}

function changes(access: TSESTree.Node): boolean {
  const { parent } = access;
  if (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === access) {
    return true;
  }
  if (handedOn(access) || elementWritten(access)) {
    return true;
  }
  return (
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === access &&
    MUTATORS.has(nameOf(parent.property) ?? '') &&
    parent.parent.type === AST_NODE_TYPES.CallExpression
  );
}

function inConstructor(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.MethodDefinition && ancestor.kind === 'constructor',
  );
}

function fixedField(member: TSESTree.MemberExpression): boolean {
  const name = nameOf(member.property);
  const owner = ancestorsOf(member).find(
    (ancestor): ancestor is TSESTree.ClassBody => ancestor.type === AST_NODE_TYPES.ClassBody,
  );
  const declared = owner?.body.find(
    (element) => element.type === AST_NODE_TYPES.PropertyDefinition && nameOf(element.key) === name,
  );
  if (
    owner === undefined ||
    declared?.type !== AST_NODE_TYPES.PropertyDefinition ||
    writtenOut(declared.value)
  ) {
    return false;
  }
  return ![...depthFirst<TSESTree.Node>(owner, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      nameOf(node.property) === name &&
      changes(node) &&
      !inConstructor(node),
  );
}

function fixedModuleValue(context: SourceContext, node: TSESTree.Identifier): boolean {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    variable !== undefined &&
    MODULE_SCOPES.has(variable.scope.type) &&
    definition?.node.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.parent?.type === AST_NODE_TYPES.VariableDeclaration &&
    definition.parent.kind === 'const' &&
    !isExported(definition.node) &&
    !writtenOut(definition.node.init) &&
    !variable.references.some((reference) => changes(reference.identifier))
  );
}

export function fixedSource(context: SourceContext, scanned: TSESTree.Node): boolean {
  const source = withoutView(scanned);
  if (source.type === AST_NODE_TYPES.Identifier) {
    return fixedModuleValue(context, source);
  }
  return (
    source.type === AST_NODE_TYPES.MemberExpression &&
    source.object.type === AST_NODE_TYPES.ThisExpression &&
    fixedField(source)
  );
}
