import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, methodCallOn, outerOf, unwrapped } from '../repeated-runs.mts';

const READ_METHODS = new Set([
  'at',
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'slice',
  'some',
  'values',
]);
const COMPARISONS = new Set(['===', '!==', '==', '!=']);

export function isAssignmentTarget(node: TSESTree.Node): boolean {
  const outer = outerOf(node);
  const { parent } = outer;
  return (
    (parent?.type === AST_NODE_TYPES.AssignmentExpression && parent.left === outer) ||
    (parent?.type === AST_NODE_TYPES.UpdateExpression && parent.argument === outer) ||
    (parent?.type === AST_NODE_TYPES.UnaryExpression &&
      parent.operator === 'delete' &&
      parent.argument === outer)
  );
}

function isCopyingUse(parent: TSESTree.Node, outer: TSESTree.Node): boolean {
  if (parent.type === AST_NODE_TYPES.ForOfStatement) {
    return parent.right === outer;
  }
  if (parent.type === AST_NODE_TYPES.SpreadElement) {
    return parent.parent.type === AST_NODE_TYPES.ArrayExpression;
  }
  return (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === outer &&
    parent.id.type === AST_NODE_TYPES.ArrayPattern
  );
}

export function isReadOnlyUse(node: TSESTree.Node): boolean {
  const outer = outerOf(node);
  const { parent } = outer;
  if (parent === undefined) {
    return false;
  }
  if (isCopyingUse(parent, outer)) {
    return true;
  }
  const method = methodCallOn(node);
  if (method === undefined) {
    return false;
  }
  if (method.call !== undefined) {
    return method.name !== undefined && READ_METHODS.has(method.name);
  }
  return (
    (method.name === 'length' || method.name === undefined) && !isAssignmentTarget(method.member)
  );
}

export function isPrivateField(classBody: TSESTree.ClassBody, field: string): boolean {
  return classBody.body.some((element) => {
    if (element.type === AST_NODE_TYPES.PropertyDefinition) {
      const { key } = element;
      return (
        !element.computed &&
        ((key.type === AST_NODE_TYPES.PrivateIdentifier && `#${key.name}` === field) ||
          (key.type === AST_NODE_TYPES.Identifier &&
            key.name === field &&
            element.accessibility === 'private'))
      );
    }
    return (
      element.type === AST_NODE_TYPES.MethodDefinition &&
      element.kind === 'constructor' &&
      element.value.params.some(
        (parameter) =>
          parameter.type === AST_NODE_TYPES.TSParameterProperty &&
          parameter.accessibility === 'private' &&
          parameter.parameter.type === AST_NODE_TYPES.Identifier &&
          parameter.parameter.name === field,
      )
    );
  });
}

export function isDedupeComparison(
  call: TSESTree.CallExpression,
  isIndexParameter: (identifier: TSESTree.Identifier) => boolean,
): boolean {
  const outer = outerOf(call);
  const comparison = outer.parent;
  if (
    comparison?.type !== AST_NODE_TYPES.BinaryExpression ||
    !COMPARISONS.has(comparison.operator)
  ) {
    return false;
  }
  const other = unwrapped(comparison.left === outer ? comparison.right : comparison.left);
  return other.type === AST_NODE_TYPES.Identifier && isIndexParameter(other);
}

export function fieldNameOf(member: TSESTree.MemberExpression): string | undefined {
  if (member.property.type === AST_NODE_TYPES.PrivateIdentifier) {
    return `#${member.property.name}`;
  }
  return memberName(member);
}
