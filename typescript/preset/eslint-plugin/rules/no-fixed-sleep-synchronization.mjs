function callsResolveTimeout(node, resolveName) {
  if (!node || typeof node !== 'object') return false;
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'setTimeout' &&
    node.arguments[0]?.type === 'Identifier' &&
    node.arguments[0].name === resolveName
  )
    return true;
  return Object.entries(node).some(
    ([key, value]) =>
      key !== 'parent' &&
      (Array.isArray(value)
        ? value.some((child) => callsResolveTimeout(child, resolveName))
        : value !== null && typeof value === 'object' && callsResolveTimeout(value, resolveName)),
  );
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      fixedSleep:
        'Fixed sleeps are non-deterministic; wait on a condition with vi.waitFor or expect.poll.',
    },
  },
  create(context) {
    if (context.filename.replaceAll('\\', '/').includes('/tests/fixtures/')) return {};
    return {
      AwaitExpression(node) {
        const argument = node.argument;
        if (
          argument.type === 'CallExpression' &&
          argument.callee.type === 'Identifier' &&
          ['sleep', 'delay', 'wait'].includes(argument.callee.name)
        ) {
          context.report({ node, messageId: 'fixedSleep' });
          return;
        }
        if (
          argument.type === 'NewExpression' &&
          argument.callee.type === 'Identifier' &&
          argument.callee.name === 'Promise'
        ) {
          const executor = argument.arguments[0];
          if (
            ['ArrowFunctionExpression', 'FunctionExpression'].includes(executor?.type) &&
            executor.params[0]?.type === 'Identifier' &&
            callsResolveTimeout(executor.body, executor.params[0].name)
          )
            context.report({ node, messageId: 'fixedSleep' });
        }
      },
    };
  },
};
