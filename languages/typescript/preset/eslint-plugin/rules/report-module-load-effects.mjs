const TOP_LEVEL_CONTROL = new Set([
  'BlockStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'SwitchStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
]);

function isDirective(node) {
  return typeof node.directive === 'string';
}

function executesAtModuleLoad(node) {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return false;
    }
    if (current.type === 'Program') {
      return true;
    }
  }
  return false;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report statements that execute observable work while a module is imported',
    },
    schema: [],
    messages: {
      sideEffectImport: 'Side-effect-only import executes code during module loading.',
      staticBlock: 'Static initialization block executes during module loading.',
      topLevelAwait: 'Top-level await delays and executes work during module loading.',
      topLevelControl: 'Top-level {{kind}} executes control flow during module loading.',
      topLevelExpression: 'Top-level expression executes work during module loading.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.specifiers.length === 0) {
          context.report({ node, messageId: 'sideEffectImport' });
        }
      },
      ExpressionStatement(node) {
        if (node.parent.type !== 'Program' || isDirective(node)) {
          return;
        }
        context.report({
          node,
          messageId:
            node.expression.type === 'AwaitExpression' ? 'topLevelAwait' : 'topLevelExpression',
        });
      },
      StaticBlock(node) {
        if (executesAtModuleLoad(node)) {
          context.report({ node, messageId: 'staticBlock' });
        }
      },
      ':statement'(node) {
        if (node.parent?.type === 'Program' && TOP_LEVEL_CONTROL.has(node.type)) {
          context.report({
            node,
            messageId: 'topLevelControl',
            data: { kind: node.type },
          });
        }
      },
    };
  },
};
