import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { literalValue } from '../../typed/syntax-views.mts';

const subprocessModules = new Set(['child_process', 'node:child_process', 'execa', 'cross-spawn']);

export const rule: TSESLint.RuleModule<'externalExecutable'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      externalExecutable: 'Tests requiring external executables belong in the integration project.',
    },
  },
  create(context) {
    function report(node: TSESTree.Node, value: unknown): void {
      if (typeof value === 'string' && subprocessModules.has(value)) {
        context.report({ node, messageId: 'externalExecutable' });
      }
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') {
          report(node, node.source.value);
        }
      },
      ImportExpression(node) {
        report(node, literalValue(node.source));
      },
      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'require') {
          report(node, literalValue(node.arguments[0]));
        }
      },
    };
  },
};
