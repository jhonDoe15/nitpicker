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

type Pending = { readonly node: TSESTree.Node; readonly depth: number };

export function* resolvedValues(
  context: SourceContext,
  node: TSESTree.Node,
  operandsOf: (value: TSESTree.Node) => readonly TSESTree.Node[],
  maxDepth: number,
): Generator<TSESTree.Node> {
  const pending: Pending[] = [{ node, depth: 0 }];
  const seen = new Set<TSESTree.Node>();
  for (const { node: current, depth } of pending) {
    const value =
      depth > maxDepth || seen.has(current) ? undefined : resolveConstant(context, current, depth);
    seen.add(current);
    if (value !== undefined) {
      yield value;
      for (const part of operandsOf(value)) {
        pending.push({ node: part, depth: depth + 1 });
      }
    }
  }
}

function tempOperands(value: TSESTree.Node): readonly TSESTree.Node[] {
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return [value.argument];
  }
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions;
  }
  if (value.type === AST_NODE_TYPES.BinaryExpression) {
    return [value.left, value.right];
  }
  if (value.type === AST_NODE_TYPES.ConditionalExpression) {
    return [value.consequent, value.alternate];
  }
  if (value.type === AST_NODE_TYPES.CallExpression && PATH_STEPS.has(nameOfCall(value))) {
    return value.arguments;
  }
  return [];
}

function createsTemp(value: TSESTree.Node): boolean {
  return value.type === AST_NODE_TYPES.CallExpression && TEMP_CREATORS.has(nameOfCall(value));
}

export function inTemp(context: SourceContext, node: TSESTree.Node): boolean {
  return [...resolvedValues(context, node, tempOperands, MAX_DEPTH)].some(createsTemp);
}

export function scopeOf(node: TSESTree.Node, program: TSESTree.Node): TSESTree.Node {
  return enclosingFunction(node) ?? program;
}

function keyIs(property: TSESTree.Property, name: string): boolean {
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Literal) {
    return key.value === name;
  }
  return !property.computed && nameOf(key) === name;
}

export function propertyNamed(
  object: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | undefined {
  return object.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property && keyIs(property, name),
  );
}
