import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { calleeNameOf, enclosingFunction } from '../typed/syntax-views.mts';

const MAX_DEPTH = 8;
const TEMP_CREATORS = new Set(['tmpdir', 'mkdtemp', 'mkdtempSync']);
const PATH_STEPS = new Set(['join', 'resolve', 'normalize', 'realpath', 'realpathSync']);

export function nameOfCall(node: TSESTree.Node): string {
  return node.type === AST_NODE_TYPES.CallExpression ? (calleeNameOf(node.callee) ?? '') : '';
}

export function inTemp(context: SourceContext, node: TSESTree.Node, depth = 0): boolean {
  const value = depth > MAX_DEPTH ? undefined : resolveConstant(context, node, depth);
  if (value === undefined) {
    return false;
  }
  const next = depth + 1;
  switch (value.type) {
    case AST_NODE_TYPES.AwaitExpression:
      return inTemp(context, value.argument, next);
    case AST_NODE_TYPES.TemplateLiteral:
      return value.expressions.some((part) => inTemp(context, part, next));
    case AST_NODE_TYPES.BinaryExpression:
      return inTemp(context, value.left, next) || inTemp(context, value.right, next);
    case AST_NODE_TYPES.ConditionalExpression:
      return inTemp(context, value.consequent, next) || inTemp(context, value.alternate, next);
    case AST_NODE_TYPES.CallExpression: {
      const name = nameOfCall(value);
      return (
        TEMP_CREATORS.has(name) ||
        (PATH_STEPS.has(name) && value.arguments.some((part) => inTemp(context, part, next)))
      );
    }
    default:
      return false;
  }
}

export function scopeOf(node: TSESTree.Node, program: TSESTree.Node): TSESTree.Node {
  return enclosingFunction(node) ?? program;
}

export function propertyNamed(
  object: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | undefined {
  return object.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property &&
      (property.computed
        ? property.key.type === AST_NODE_TYPES.Literal && property.key.value === name
        : (nameOf(property.key) ?? (property.key as TSESTree.Literal).value) === name),
  );
}
