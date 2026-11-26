import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isExpectCall } from '../../analysis/test-code-analysis.mts';
import { ancestorsOf, contains, nameOf } from '../../typed/node-views.mts';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';

const MAX_PORT = 65_535;
const TAKEN_PORT_TITLE =
  /\bEADDRINUSE\b|\bport\b.+\b(?:not available|in use|occupied|taken|busy)\b/iu;
const FAIL_OWNERS = new Set(['assert', 't', 'expect', 'chai']);
const LISTEN_DOUBLE = /^(?:listen|(?:spy|stub|mock)\w*Listen|listen(?:Spy|Stub|Mock))$/iu;

function ownerName(node: TSESTree.Node): string {
  const owner = node.type === AST_NODE_TYPES.MemberExpression ? node.property : node;
  return nameOf(node) ?? nameOf(owner) ?? '';
}

function isFailCall(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'fail';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'fail' &&
    FAIL_OWNERS.has(ownerName(callee.object))
  );
}

function descendants(context: SourceContext, root: TSESTree.Node): TSESTree.Node[] {
  const found: TSESTree.Node[] = [];
  forEachNode(context, root, (node) => found.push(node));
  return found;
}

function expectsFailure(context: SourceContext, node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      (isExpectCall(ancestor) &&
        ancestor.type === AST_NODE_TYPES.CallExpression &&
        ancestor.arguments.some((argument) => contains(argument, node))) ||
      (ancestor.type === AST_NODE_TYPES.TryStatement &&
        contains(ancestor.block, node) &&
        descendants(context, ancestor.block).some(isFailCall)),
  );
}

function titleOf(call: TSESTree.CallExpression): string {
  const [first] = call.arguments;
  if (first?.type === AST_NODE_TYPES.Literal) {
    return String(first.value);
  }
  return first?.type === AST_NODE_TYPES.TemplateLiteral
    ? first.quasis.map((quasi) => quasi.value.cooked).join(' ')
    : '';
}

function doublesListen(context: SourceContext, owner: TSESTree.CallExpression): boolean {
  return descendants(context, owner).some((node) => {
    if (node.type === AST_NODE_TYPES.Literal) {
      return node.value === 'listen';
    }
    const isProperty =
      node.parent?.type === AST_NODE_TYPES.MemberExpression && node.parent.property === node;
    return node.type === AST_NODE_TYPES.Identifier && LISTEN_DOUBLE.test(node.name) && !isProperty;
  });
}

export function isExemptBinding(
  context: SourceContext,
  call: TSESTree.Node,
  { port, owners }: { readonly port: number; readonly owners: readonly TSESTree.CallExpression[] },
): boolean {
  const [nearest] = owners;
  return (
    port > MAX_PORT ||
    expectsFailure(context, call) ||
    owners.some((owner) => TAKEN_PORT_TITLE.test(titleOf(owner))) ||
    (nearest !== undefined && doublesListen(context, nearest))
  );
}
