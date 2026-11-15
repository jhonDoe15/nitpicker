import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../analysis/test-code-analysis.mts';
import {
  ancestorsOf,
  chainOf,
  contains,
  depthFirst,
  isNode,
  type Ranged,
} from '../../typed/node-views.mts';
import { isFunction, type FunctionNode } from '../../typed/syntax-views.mts';
import { unwrapped } from '../../security/security-values.mts';

export { contains, memberName, unwrapped };

export type MethodUse =
  | {
      readonly name: string | undefined;
      readonly call: TSESTree.CallExpression;
      readonly member?: undefined;
    }
  | {
      readonly name: string | undefined;
      readonly call?: undefined;
      readonly member: TSESTree.MemberExpression;
    };
type Role = 'loop' | 'callback' | 'handler' | 'recursion';

const WRAPPERS = new Set<string>([
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
]);
const ITERATION_METHODS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some',
  'sort',
  'toSorted',
]);
const LISTENER_METHODS = new Set([
  'addEventListener',
  'addListener',
  'on',
  'once',
  'prependListener',
  'prependOnceListener',
  'subscribe',
]);

export function outerOf(node: TSESTree.Node): TSESTree.Node {
  return (
    chainOf<TSESTree.Node>(node, (current) =>
      current.parent !== undefined && WRAPPERS.has(current.parent.type)
        ? current.parent
        : undefined,
    ).at(-1) ?? node
  );
}

export function calledMember(call: TSESTree.CallExpression): TSESTree.MemberExpression | undefined {
  const callee = unwrapped(call.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression ? callee : undefined;
}

export function methodCallOn(node: TSESTree.Node): MethodUse | undefined {
  const member = outerOf(node).parent;
  if (member?.type !== AST_NODE_TYPES.MemberExpression || unwrapped(member.object) !== node) {
    return undefined;
  }
  const call = outerOf(member).parent;
  return call?.type === AST_NODE_TYPES.CallExpression && calledMember(call) === member
    ? { name: memberName(member), call }
    : { name: memberName(member), member };
}

function callbackRole(fn: TSESTree.Node): Role | undefined {
  const call = outerOf(fn).parent;
  const args: readonly TSESTree.Node[] =
    call?.type === AST_NODE_TYPES.CallExpression ? call.arguments : [];
  if (call?.type !== AST_NODE_TYPES.CallExpression || !args.includes(outerOf(fn))) {
    return undefined;
  }
  const member = calledMember(call);
  const name = member === undefined ? undefined : memberName(member);
  if (name === undefined) {
    return undefined;
  }
  if (ITERATION_METHODS.has(name)) {
    return 'callback';
  }
  return LISTENER_METHODS.has(name) ? 'handler' : undefined;
}

function repeatsChild(loop: TSESTree.Node, child: TSESTree.Node | undefined): boolean {
  if (loop.type === AST_NODE_TYPES.ForOfStatement || loop.type === AST_NODE_TYPES.ForInStatement) {
    return child === loop.body;
  }
  if (loop.type === AST_NODE_TYPES.ForStatement) {
    return child !== loop.init;
  }
  return (
    loop.type === AST_NODE_TYPES.WhileStatement || loop.type === AST_NODE_TYPES.DoWhileStatement
  );
}

function functionName(fn: FunctionNode): string | undefined {
  if (fn.id !== null) {
    return fn.id.name;
  }
  const declarator = outerOf(fn).parent;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier
    ? declarator.id.name
    : undefined;
}

function isRecursive(fn: FunctionNode): boolean {
  const name = functionName(fn);
  return name !== undefined && referencesName(fn.body, name);
}

function roleOf(
  node: TSESTree.Node,
  child: TSESTree.Node | undefined,
  recursion: boolean,
): Role | undefined {
  if (repeatsChild(node, child)) {
    return 'loop';
  }
  if (!isFunction(node)) {
    return undefined;
  }
  return callbackRole(node) ?? (recursion && isRecursive(node) ? 'recursion' : undefined);
}

export function repeatedRole(
  node: TSESTree.Node,
  boundary: Ranged,
  { recursion }: Readonly<Record<string, unknown>> = {},
): Role | undefined {
  const chain = [node, ...ancestorsOf(node)];
  const index = chain.findIndex((ancestor, position) => {
    if (position === 0 || contains(ancestor, boundary)) {
      return false;
    }
    return roleOf(ancestor, chain[position - 1], recursion === true) !== undefined;
  });
  const found = index === -1 ? undefined : chain[index];
  return found === undefined ? undefined : roleOf(found, chain[index - 1], recursion === true);
}

function isNameSlot(node: TSESTree.Node, key: string): boolean {
  return (
    (key === 'property' && node.type === AST_NODE_TYPES.MemberExpression && !node.computed) ||
    (key === 'key' && node.type === AST_NODE_TYPES.Property && !node.computed)
  );
}

function codeChildren(node: TSESTree.Node): TSESTree.Node[] {
  return Object.entries(node)
    .filter(([key]) => key !== 'parent' && !isNameSlot(node, key))
    .flatMap(([, value]): unknown[] => (Array.isArray(value) ? value : [value]))
    .filter(isNode);
}

export function someNode(
  node: TSESTree.Node,
  predicate: (node: TSESTree.Node) => boolean,
): boolean {
  return [...depthFirst<TSESTree.Node>(node, codeChildren)].some(predicate);
}

export function referencesName(node: TSESTree.Node, name: string): boolean {
  return someNode(node, (child) => child.type === AST_NODE_TYPES.Identifier && child.name === name);
}

export function returnedExpression(fn: TSESTree.Node | undefined): TSESTree.Node | undefined {
  if (
    fn?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    fn?.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return undefined;
  }
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return fn.body;
  }
  const [only] = fn.body.body;
  return fn.body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

export function singleParameter(fn: TSESTree.Node | undefined): string | undefined {
  if (
    fn?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    fn?.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return undefined;
  }
  const [parameter] = fn.params;
  return parameter?.type === AST_NODE_TYPES.Identifier ? parameter.name : undefined;
}

export function equalitySides(
  expression: TSESTree.Node | undefined,
): [TSESTree.Node, TSESTree.Node] | undefined {
  const body = expression === undefined ? undefined : unwrapped(expression);
  return body?.type === AST_NODE_TYPES.BinaryExpression && ['===', '=='].includes(body.operator)
    ? [body.left, body.right]
    : undefined;
}

export function numberValue(node: TSESTree.Node | undefined): number | undefined {
  const value = node === undefined ? undefined : unwrapped(node);
  if (value === undefined) {
    return undefined;
  }
  const negated = value.type === AST_NODE_TYPES.UnaryExpression && value.operator === '-';
  const literal = negated ? unwrapped(value.argument) : value;
  if (literal.type !== AST_NODE_TYPES.Literal || typeof literal.value !== 'number') {
    return undefined;
  }
  return negated ? -literal.value : literal.value;
}
