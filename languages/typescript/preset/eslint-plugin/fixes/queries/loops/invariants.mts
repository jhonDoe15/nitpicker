import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { descendants } from '../../../rules/loops/loop-shapes.mts';
import { chainOf, contains, type SourceCode } from '../../../rules/typed/node-views.mts';
import { visibleVariable } from '../../support/scope.mts';

const DELETE = 'delete';
export const MUTATING_METHODS: ReadonlySet<string> = new Set([
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
  DELETE,
  'clear',
  'assign',
]);
export const PLAIN_NODE_TYPES: ReadonlySet<string> = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.ThisExpression,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.TemplateElement,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.BinaryExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
]);
const LOGGING = /log/iu;

export type Repeated = {
  readonly range: TSESTree.Range;
  readonly body: TSESTree.Node;
  readonly target: TSESTree.Node;
};

function isPlainLink(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    !node.optional &&
    node.property.type === AST_NODE_TYPES.Identifier
  );
}

export function plainChainRoot(node: TSESTree.Node): TSESTree.Node | undefined {
  const links = chainOf<TSESTree.Node>(node, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression ? link.object : undefined,
  );
  return links.slice(0, -1).every(isPlainLink) ? links.at(-1) : undefined;
}

export type InvariantScope = Repeated & { readonly except?: string };

function innerOf(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.object;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return node.callee;
  }
  return node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
    ? node.expression
    : undefined;
}

function rootName(node: TSESTree.Node): string | undefined {
  const chain = [node];
  for (const current of chain) {
    const next = innerOf(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  if (root?.type === AST_NODE_TYPES.ThisExpression) {
    return 'this';
  }
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function memberNames(node: TSESTree.MemberExpression): string[] {
  const names: string[] = [];
  const chain: TSESTree.Node[] = [node];
  for (const current of chain) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      names.push(current.property.type === AST_NODE_TYPES.Identifier ? current.property.name : '');
      chain.push(current.object);
    }
  }
  return names;
}

function callMutation(node: TSESTree.CallExpression): string | undefined {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (rootName(callee) === 'this') {
    return LOGGING.test(memberNames(callee).join('.')) ? undefined : 'this';
  }
  const [method = ''] = memberNames(callee);
  return MUTATING_METHODS.has(method) ? rootName(callee.object) : undefined;
}

function targetOf(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return node.left;
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === DELETE
    ? node.argument
    : undefined;
}

function mutationRoot(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callMutation(node);
  }
  const target = targetOf(node);
  return target?.type === AST_NODE_TYPES.MemberExpression ? rootName(target) : undefined;
}

function mutatedRoots(
  sourceCode: SourceCode,
  { body, target }: Pick<Repeated, 'body' | 'target'>,
): ReadonlySet<string> {
  const roots = descendants(body, sourceCode.visitorKeys, () => false)
    .filter((node) => !contains(target, node))
    .map(mutationRoot)
    .filter((root) => root !== undefined);
  return new Set(roots);
}

export function isReference(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === node || parent.computed;
  }
  return !(
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === node &&
    !parent.computed &&
    !parent.shorthand
  );
}

function isStable(
  sourceCode: SourceCode,
  node: TSESTree.Identifier,
  range: TSESTree.Range,
): boolean {
  const variable = visibleVariable(sourceCode, node, node.name);
  if (variable === undefined) {
    return true;
  }
  const region = { range };
  const declaredInside = variable.defs.some((def) => contains(region, def.name));
  const writtenInside = variable.references.some(
    (reference) => reference.isWrite() && contains(region, reference.identifier),
  );
  return !(declaredInside || writtenInside);
}

function isPlainNode(node: TSESTree.Node): boolean {
  if (!PLAIN_NODE_TYPES.has(node.type)) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator !== DELETE;
  }
  return (
    node.type !== AST_NODE_TYPES.Property ||
    (!node.computed && node.kind === 'init' && !node.method)
  );
}

export function isInvariant(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  repeated: InvariantScope,
): boolean {
  const { except } = repeated;
  const nodes = descendants(node, sourceCode.visitorKeys, () => false);
  if (!nodes.every(isPlainNode)) {
    return false;
  }
  const mutated = mutatedRoots(sourceCode, repeated);
  return nodes.every((each) => {
    if (each.type === AST_NODE_TYPES.ThisExpression) {
      return !mutated.has('this');
    }
    if (each.type !== AST_NODE_TYPES.Identifier || !isReference(each) || each.name === except) {
      return true;
    }
    return isStable(sourceCode, each, repeated.range) && !mutated.has(each.name);
  });
}

export function mentions(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  return descendants(node, sourceCode.visitorKeys, () => false).some(
    (each) => each.type === AST_NODE_TYPES.Identifier && each.name === name && isReference(each),
  );
}
