import { productionModulePath } from './production-source.mjs';

function requireSource(node) {
  const argument = node.arguments[0];
  const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';
  return isRequire && argument?.type === 'Literal' ? argument.value : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep production code out of test setup files' },
    schema: [],
    messages: {
      productionImport:
        'A setup file runs before every test file, so production code imported here is covered without a test. Import {{source}} in the tests that need it. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    function check(node, source) {
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
        if (node.source) {
          check(node, node.source.value);
        }
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
      CallExpression(node) {
        check(node, requireSource(node));
      },
    };
  },
};
