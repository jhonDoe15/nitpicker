export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep production logging on the application logger path',
    },
    schema: [],
    messages: {
      consoleCall: 'Use the application logger instead of console.{{method}}().',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'console' &&
          node.callee.property.type === 'Identifier'
        ) {
          context.report({
            node,
            messageId: 'consoleCall',
            data: { method: node.callee.property.name },
          });
        }
      },
    };
  },
};
