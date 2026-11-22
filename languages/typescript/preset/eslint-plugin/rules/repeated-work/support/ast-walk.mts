import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

const { DefinitionType } = TSESLint.Scope;

const REPEATING_CONTAINERS = new Set<string>([
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

export function isReferencedIdentifier(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    !parent.computed &&
    parent.property === node
  ) {
    return false;
  }
  return !(
    parent.type === AST_NODE_TYPES.Property &&
    !parent.computed &&
    parent.key === node &&
    !parent.shorthand
  );
}

export function isReadIdentifier(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  if (parent === undefined || !isReferencedIdentifier(node)) {
    return false;
  }
  if (
    (parent.type === AST_NODE_TYPES.VariableDeclarator ||
      parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression) &&
    parent.id === node
  ) {
    return false;
  }
  return !(parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node);
}

export function referencesAny(
  context: SourceContext,
  root: TSESTree.Node,
  names: ReadonlySet<string>,
): boolean {
  let found = false;
  forEachNode(context, root, (node) => {
    if (!found && node.type === AST_NODE_TYPES.Identifier && names.has(node.name)) {
      found = true;
    }
  });
  return found;
}

function expandPattern(node: TSESTree.Node, pending: TSESTree.Node[], names: Set<string>): void {
  if (node.type === AST_NODE_TYPES.Identifier) {
    names.add(node.name);
    return;
  }
  if (node.type === AST_NODE_TYPES.RestElement) {
    pending.push(node.argument);
    return;
  }
  if (node.type === AST_NODE_TYPES.AssignmentPattern) {
    pending.push(node.left);
    return;
  }
  if (node.type === AST_NODE_TYPES.ArrayPattern) {
    appendAll(
      pending,
      node.elements.filter((element) => element !== null),
    );
    return;
  }
  if (node.type === AST_NODE_TYPES.ObjectPattern) {
    appendAll(
      pending,
      node.properties.map((prop) =>
        prop.type === AST_NODE_TYPES.RestElement ? prop.argument : prop.value,
      ),
    );
  }
}

export function patternNames(root: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  const pending: TSESTree.Node[] = [root];
  for (const current of pending) {
    expandPattern(current, pending, names);
  }
  return names;
}

export { calleeName } from '../../analysis/node/call-text.mts';

export function localFunctionFor(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
): FunctionNode | undefined {
  const value = unwrapped(callee);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = variableNamed(sourceCode, value);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === DefinitionType.FunctionName) {
    return definition.node.type === AST_NODE_TYPES.FunctionDeclaration
      ? definition.node
      : undefined;
  }
  if (
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.init !== null
  ) {
    const init = unwrapped(definition.node.init);
    return isFunction(init) ? init : undefined;
  }
  return undefined;
}

export function isStaticMethodCall(
  call: TSESTree.CallExpression,
  objectName: string,
  methodName: string,
): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const object = unwrapped(callee.object);
  return (
    object.type === AST_NODE_TYPES.Identifier &&
    object.name === objectName &&
    memberName(callee) === methodName
  );
}

export function isRepeatedRelativeTo(use: TSESTree.Node, boundary: TSESTree.Node): boolean {
  return ancestorsOf(use).some(
    (ancestor) =>
      REPEATING_CONTAINERS.has(ancestor.type) &&
      !contains(ancestor, boundary) &&
      !(ancestor.type === AST_NODE_TYPES.ForOfStatement && contains(ancestor.right, use)),
  );
}
