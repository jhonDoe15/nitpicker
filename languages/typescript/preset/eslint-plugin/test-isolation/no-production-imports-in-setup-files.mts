import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { literalValue } from '../rules/typed/syntax-views.mts';
import { productionModulePath } from './production-source.mts';

function requireSource(node: TSESTree.CallExpression): unknown {
  const argument = node.arguments[0];
  const isRequire =
    node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === 'require';
  return isRequire ? literalValue(argument) : undefined;
}

export const rule: TSESLint.RuleModule<'productionImport'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep production code out of test setup files' },
    schema: [],
    messages: {
      productionImport:
        'A setup file runs before every test file, so production code imported here is covered without a test. Import {{source}} in the tests that need it.',
    },
  },
  create(context) {
    function check(node: TSESTree.Node, source: unknown): void {
      if (productionModulePath(source, context.filename) === undefined) {
        return;
      }
      context.report({ node, messageId: 'productionImport', data: { source } });
    }
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          check(node, node.source.value);
        }
      },
      ImportExpression(node) {
        check(node, literalValue(node.source));
      },
      CallExpression(node) {
        check(node, requireSource(node));
      },
    };
  },
};
