import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, isNode, objectChildren } from '../typed/node-views.mts';

const PROCESS_MEMBERS = new Set(['argv', 'exit', 'exitCode']);

function isEntryPoint(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MetaProperty ||
    (node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === 'require' &&
      node.property.type === AST_NODE_TYPES.Identifier &&
      node.property.name === 'main')
  );
}

export function mentionsEntryPoint(node: TSESTree.Node): boolean {
  for (const current of depthFirst(node, objectChildren)) {
    if (isNode(current) && isEntryPoint(current)) {
      return true;
    }
  }
  return false;
}

function insideMainGuard(node: TSESTree.MemberExpression): boolean {
  for (const current of [node, ...ancestorsOf(node)]) {
    const parent = current.parent;
    if (!parent) {
      continue;
    }
    if (
      parent.type === AST_NODE_TYPES.IfStatement &&
      (current === parent.test || current === parent.consequent) &&
      mentionsEntryPoint(parent.test)
    ) {
      return true;
    }
  }
  return false;
}

export const rule: TSESLint.RuleModule<'processGlobalOutsideGuard'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      processGlobalOutsideGuard:
        'A test helper or fixture script may use process.{{member}} only inside a main guard such as `if (import.meta.main)`. Export a function that takes the arguments and returns the exit code, and call it from the main guard, so tests can import it instead of spawning it.',
    },
  },
  create(context) {
    return {
      MemberExpression(node: TSESTree.MemberExpression) {
        if (
          node.computed ||
          node.object.type !== AST_NODE_TYPES.Identifier ||
          node.object.name !== 'process' ||
          node.property.type !== AST_NODE_TYPES.Identifier ||
          !PROCESS_MEMBERS.has(node.property.name) ||
          insideMainGuard(node)
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'processGlobalOutsideGuard',
          data: { member: node.property.name },
        });
      },
    };
  },
};
