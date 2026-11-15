import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { foldTree } from '../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../typed/syntax-views.mts';

export type LiteralPart = { readonly node: TSESTree.Node; readonly text: string };
type FoldEntries = readonly (readonly [TSESTree.Node, TSESTree.Node])[];

const WRAPPERS = [
  ...TYPE_ASSERTIONS,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.AwaitExpression,
];
const TEXT_PRESERVING_METHODS = new Set(['trim', 'trimStart', 'trimEnd', 'toString', 'normalize']);
const STRING_WRAPPERS = new Set(['String', 'Buffer.from']);
const ENV_OBJECTS = new Set(['process.env', 'import.meta.env', 'Deno.env', 'Bun.env']);

export function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
}

function baseName(inner: TSESTree.Node): string | undefined {
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return inner.name;
  }
  if (inner.type === AST_NODE_TYPES.ThisExpression) {
    return 'this';
  }
  return inner.type === AST_NODE_TYPES.MetaProperty
    ? `${inner.meta.name}.${inner.property.name}`
    : undefined;
}

export function dottedName(node: TSESTree.Node): string | undefined {
  const properties: string[] = [];
  const pending = [unwrapped(node)];
  for (const inner of pending) {
    if (inner.type !== AST_NODE_TYPES.MemberExpression || inner.computed) {
      const base = baseName(inner);
      return base === undefined ? undefined : [base, ...properties].join('.');
    }
    properties.unshift(inner.property.name);
    pending.push(unwrapped(inner.object));
  }
  return undefined;
}

export function stringKey(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0
    ? (node.quasis[0]?.value.cooked ?? undefined)
    : undefined;
}

export function memberName(member: TSESTree.MemberExpression): string | undefined {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) {
    return member.property.name;
  }
  return member.computed ? stringKey(member.property) : undefined;
}

function callLiteral(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = dottedName(call.callee);
  if (STRING_WRAPPERS.has(callee ?? '') && call.arguments.length > 0) {
    return call.arguments[0];
  }
  const { callee: member } = call;
  const isMethod =
    member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    TEXT_PRESERVING_METHODS.has(member.property.name);
  return isMethod ? member.object : undefined;
}

function joinedText(
  binary: TSESTree.BinaryExpression,
): (parts: LiteralPart[], part: LiteralPart) => LiteralPart[] {
  return (parts, part) => {
    const [first] = parts;
    return first === undefined ? [part] : [{ node: binary, text: first.text + part.text }];
  };
}

function literalChildren(inner: TSESTree.Node): TSESTree.Node[] {
  if (inner.type === AST_NODE_TYPES.BinaryExpression && inner.operator === '+') {
    return [inner.left, inner.right];
  }
  if (inner.type === AST_NODE_TYPES.LogicalExpression && inner.operator !== '&&') {
    return [inner.left, inner.right];
  }
  if (inner.type === AST_NODE_TYPES.ConditionalExpression) {
    return [inner.consequent, inner.alternate];
  }
  const source = inner.type === AST_NODE_TYPES.CallExpression ? callLiteral(inner) : undefined;
  return source === undefined ? [] : [source];
}

function literalEntries(_node: TSESTree.Node, inner: TSESTree.Node): FoldEntries {
  return stringKey(inner) === undefined
    ? literalChildren(inner).map((child): readonly [TSESTree.Node, TSESTree.Node] => [
        child,
        unwrapped(child),
      ])
    : [];
}

function combineLiteralParts(
  _node: TSESTree.Node,
  inner: TSESTree.Node,
  childResults: LiteralPart[][],
): LiteralPart[] {
  const text = stringKey(inner);
  if (text !== undefined) {
    return [{ node: inner, text }];
  }
  const parts = childResults.flat();
  return inner.type === AST_NODE_TYPES.BinaryExpression
    ? parts.reduce<LiteralPart[]>(joinedText(inner), [])
    : parts;
}

export function literalParts(node: TSESTree.Node): LiteralPart[] {
  return foldTree<TSESTree.Node, TSESTree.Node, LiteralPart[]>(node, unwrapped(node), {
    expand: literalEntries,
    combine: combineLiteralParts,
  });
}

export function envKey(node: TSESTree.Node): string | undefined {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.MemberExpression) {
    const object = dottedName(inner.object);
    return ENV_OBJECTS.has(object ?? '') ? memberName(inner) : undefined;
  }
  if (inner.type !== AST_NODE_TYPES.CallExpression || dottedName(inner.callee) !== 'Deno.env.get') {
    return undefined;
  }
  const [first] = inner.arguments;
  return first === undefined ? undefined : stringKey(first);
}
