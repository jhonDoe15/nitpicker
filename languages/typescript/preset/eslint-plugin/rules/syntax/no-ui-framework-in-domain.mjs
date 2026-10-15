const UI_FRAMEWORK = /^(?:react|react-dom|react-native|preact)(?:\/|$)/u;

function literalSource(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function requiredSource(node) {
  const isRequire = node.callee.type === 'Identifier' && node.callee.name === 'require';
  return isRequire ? literalSource(node.arguments[0]) : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep UI frameworks out of domain/' },
    schema: [],
    messages: {
      uiFramework:
        'domain/ does not import react, react-dom, react-native or preact: components and hooks live in adapters/ (or shared/ui) and call the logic in domain/. If a framework requires this file in domain/, add an exception for this rule for those paths in nitpicker.config.json.',
    },
  },
  create(context) {
    function check(node, source) {
      if (source !== undefined && UI_FRAMEWORK.test(source)) {
        context.report({ node, messageId: 'uiFramework' });
      }
    }
    return {
      ImportDeclaration(node) {
        check(node, literalSource(node.source));
      },
      ImportExpression(node) {
        check(node, literalSource(node.source));
      },
      ExportNamedDeclaration(node) {
        check(node, literalSource(node.source));
      },
      ExportAllDeclaration(node) {
        check(node, literalSource(node.source));
      },
      TSImportEqualsDeclaration(node) {
        check(node, literalSource(node.moduleReference.expression));
      },
      CallExpression(node) {
        check(node, requiredSource(node));
      },
    };
  },
};
