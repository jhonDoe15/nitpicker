import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { memberName } from '../security/security-values.mts';
import { unchained } from '../text-splits/split-calls.mts';

const HOST_NAME = /^(?:host|hostname|authority|origin|[a-z0-9]+Host)$/u;
const HOST_HEADER = /^(?:host|x-forwarded-host|:authority)$/iu;
const HEADER_READERS = new Set(['get', 'header', 'getHeader']);

function isHostHeaderRead(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const { callee } = node;
    const [name] = node.arguments;
    return (
      callee.type === AST_NODE_TYPES.MemberExpression &&
      HEADER_READERS.has(memberName(callee) ?? '') &&
      HOST_HEADER.test(name === undefined ? '' : (stringValue(name) ?? ''))
    );
  }
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const name = memberName(node);
  const holder = unchained(node.object);
  return (
    HOST_HEADER.test(name ?? '') &&
    holder.type === AST_NODE_TYPES.MemberExpression &&
    memberName(holder) === 'headers'
  );
}

export function isHostValue(node: TSESTree.Node): boolean {
  const value = unchained(node);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return HOST_NAME.test(value.name);
  }
  if (value.type === AST_NODE_TYPES.MemberExpression && HOST_NAME.test(memberName(value) ?? '')) {
    return true;
  }
  return isHostHeaderRead(value);
}
