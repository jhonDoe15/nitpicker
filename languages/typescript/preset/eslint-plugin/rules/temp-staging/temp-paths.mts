import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { compositeOperands, nameOf } from '../typed/node-views.mts';
import { calleeNameOf, enclosingFunction } from '../typed/syntax-views.mts';

const MAX_DEPTH = 8;
const TEMP_CREATORS = new Set(['tmpdir', 'mkdtemp', 'mkdtempSync']);
const PATH_STEPS = new Set(['join', 'resolve', 'normalize', 'realpath', 'realpathSync']);

export function nameOfCall(node: TSESTree.Node): string {
  return node.type === AST_NODE_TYPES.CallExpression ? (calleeNameOf(node.callee) ?? '') : '';
}

type Pending = { readonly node: TSESTree.Node; readonly depth: number };

interface ResolveOptions {
  readonly context: SourceContext;
  readonly node: TSESTree.Node;
  readonly operandsOf: (value: TSESTree.Node) => readonly TSESTree.Node[];
  readonly maxDepth: number;
}

function resolvedAt(options: ResolveOptions, pending: Pending): TSESTree.Node | undefined {
  return pending.depth > options.maxDepth
    ? undefined
    : resolveConstant(options.context, pending.node, pending.depth);
}

export function* resolvedValues(options: ResolveOptions): Generator<TSESTree.Node> {
  const pending: Pending[] = [{ node: options.node, depth: 0 }];
  const seen = new Set<TSESTree.Node>();
  for (const item of pending) {
    const value = seen.has(item.node) ? undefined : resolvedAt(options, item);
    seen.add(item.node);
    if (value === undefined) {
      continue;
    }
    yield value;
    for (const part of options.operandsOf(value)) {
      pending.push({ node: part, depth: item.depth + 1 });
    }
  }
}

function tempOperands(value: TSESTree.Node): readonly TSESTree.Node[] {
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return [value.argument];
  }
  const composite = compositeOperands(value);
  if (composite !== undefined) {
    return composite;
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
  return [...resolvedValues({ context, node, operandsOf: tempOperands, maxDepth: MAX_DEPTH })].some(
    createsTemp,
  );
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
