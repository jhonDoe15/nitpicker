export function consoleMethodOf(call) {
  const { callee } = call;
  const isConsoleMember =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'console' &&
    callee.property.type === 'Identifier';
  return isConsoleMember ? callee.property.name : undefined;
}

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
        const method = consoleMethodOf(node);
        if (method !== undefined) {
          context.report({ node, messageId: 'consoleCall', data: { method } });
        }
      },
    };
  },
};
