const NETWORK_MODULES = new Map([
  ['http', new Set(['request', 'get'])],
  ['https', new Set(['request', 'get'])],
  ['net', new Set(['connect', 'createConnection'])],
]);

function moduleName(source) {
  return source.replace(/^node:/u, '');
}

function isNewDateWithoutArguments(node) {
  return (
    node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0
  );
}

function isMemberCall(node, objectName, propertyName) {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === objectName &&
    callee.property.name === propertyName
  );
}

function isFakeClockSetup(node) {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    ['useFakeTimers', 'setSystemTime'].includes(callee.property.name)
  );
}

function isRandomSpy(node) {
  const [target, method] = node.arguments;
  return (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === 'spyOn' &&
    target?.type === 'Identifier' &&
    target.name === 'Math' &&
    method?.value === 'random'
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep the real clock, randomness and network out of tests' },
    schema: [
      {
        type: 'object',
        properties: { network: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      clock:
        'The real clock makes the test depend on when it runs. Pass the time in, or fake it with `vi.useFakeTimers()` and `vi.setSystemTime(...)`. A justified exception goes in nitpicker.config.json.',
      random:
        'Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with `vi.spyOn(Math, "random")`. A justified exception goes in nitpicker.config.json.',
      network:
        'A unit test must not reach the network. Inject the client and fake it. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    const checksNetwork = context.options[0]?.network === true;
    const clockCalls = [];
    const randomCalls = [];
    const state = { fakeClock: false, randomSpy: false };
    const networkBindings = new Map();
    function trackNetworkImport(node) {
      const allowed = NETWORK_MODULES.get(moduleName(node.source.value));
      if (allowed === undefined) return;
      for (const specifier of node.specifiers) {
        const imported = specifier.type === 'ImportSpecifier' ? specifier.imported.name : '*';
        networkBindings.set(specifier.local.name, { allowed, imported });
      }
    }
    function isNetworkCall(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        const binding = networkBindings.get(callee.name);
        const isGlobalFetch =
          callee.name === 'fetch' &&
          context.sourceCode
            .getScope(node)
            .references.some(
              (reference) =>
                reference.identifier === callee &&
                (reference.resolved === null || reference.resolved.defs.length === 0),
            );
        return isGlobalFetch || (binding !== undefined && binding.allowed.has(binding.imported));
      }
      if (callee.type !== 'MemberExpression' || callee.computed) return false;
      const binding = networkBindings.get(callee.object.name);
      return binding !== undefined && binding.allowed.has(callee.property.name);
    }
    return {
      ImportDeclaration: trackNetworkImport,
      NewExpression(node) {
        if (isNewDateWithoutArguments(node)) clockCalls.push(node);
        if (
          checksNetwork &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'WebSocket'
        ) {
          context.report({ node, messageId: 'network' });
        }
      },
      CallExpression(node) {
        if (isMemberCall(node, 'Date', 'now')) clockCalls.push(node);
        if (isMemberCall(node, 'Math', 'random')) randomCalls.push(node);
        state.fakeClock ||= isFakeClockSetup(node);
        state.randomSpy ||= isRandomSpy(node);
        if (checksNetwork && isNetworkCall(node)) context.report({ node, messageId: 'network' });
      },
      'Program:exit'() {
        if (!state.fakeClock) {
          for (const node of clockCalls) context.report({ node, messageId: 'clock' });
        }
        if (!state.randomSpy) {
          for (const node of randomCalls) context.report({ node, messageId: 'random' });
        }
      },
    };
  },
};
