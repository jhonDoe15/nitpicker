import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { unwrapped } from '../security/security-values.mts';
import { calleeNameOf } from '../typed/syntax-views.mts';

type Node = TSESTree.Node;
export type Link = {
  readonly call: TSESTree.CallExpression;
  readonly pattern: Node | undefined;
  readonly replacement: string | undefined;
};
export type Chain = { readonly links: readonly Link[]; readonly root: Node };

export function textReceiverOf(
  node: TSESTree.CallExpression,
  methods: ReadonlySet<string>,
): Node | undefined {
  if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
    return methods.has(calleeNameOf(node.callee) ?? '') ? node.callee.object : undefined;
  }
  return node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'String' &&
    node.arguments.length === 1
    ? node.arguments[0]
    : undefined;
}

const REPLACE_METHODS = new Set<string>(['replace', 'replaceAll']);
const ESCAPE_NAME = /escape|quote/iu;
const ESCAPING_REPLACEMENT = /\$[&0-9]|^[\\!^]{1,2}[%_]$/u;

export function replaceReceiver(node: Node): TSESTree.CallExpression | undefined {
  const target = unwrapped(node);
  return target.type === AST_NODE_TYPES.CallExpression &&
    target.callee.type === AST_NODE_TYPES.MemberExpression &&
    REPLACE_METHODS.has(calleeNameOf(target.callee) ?? '') &&
    target.arguments.length === 2
    ? target
    : undefined;
}

export function replaceChainAt(top: TSESTree.CallExpression): Chain {
  const links: Link[] = [];
  const pending: Node[] = [top];
  for (const current of pending) {
    const call = replaceReceiver(current);
    if (call === undefined || call.callee.type !== AST_NODE_TYPES.MemberExpression) {
      return { links: links.toReversed(), root: current };
    }
    links.push({ call, pattern: call.arguments[0], replacement: stringValue(call.arguments[1]) });
    pending.push(call.callee.object);
  }
  return { links, root: top };
}

export function isChainTop(call: TSESTree.CallExpression): boolean {
  const holder = call.parent;
  return !(
    holder.type === AST_NODE_TYPES.MemberExpression &&
    holder.object === call &&
    holder.parent.type === AST_NODE_TYPES.CallExpression &&
    replaceReceiver(holder.parent) !== undefined
  );
}

export function isEscapingLink(link: Link): boolean {
  return link.replacement !== undefined && ESCAPING_REPLACEMENT.test(link.replacement);
}

export function isEscapeCall(node: Node): boolean {
  const target = unwrapped(node);
  return (
    target.type === AST_NODE_TYPES.CallExpression &&
    ESCAPE_NAME.test(calleeNameOf(target.callee) ?? '')
  );
}

export function isEscapedRoot(node: Node): boolean {
  const target = unwrapped(node);
  return (
    isEscapeCall(target) ||
    (target.type === AST_NODE_TYPES.Identifier && ESCAPE_NAME.test(target.name))
  );
}
