import { createRunnerApis, runnerApiVisitors } from '../rules/runner-apis/runner-apis.mjs';
import { fakeTimerChange, spiedMember } from '../rules/runner-apis/runner-doubles.mjs';
import { RUNNER_OPTION_PROPERTY, vocabularyOf } from '../rules/runner-apis/runner-option.mjs';

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

const CLOCK_SETTERS = new Set(['setSystemTime', 'setTime']);

function isFakeClockSetup(apis, node) {
  const callee = node.callee;
  const setsClock =
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    CLOCK_SETTERS.has(callee.property.name);
  return setsClock || fakeTimerChange(apis, node)?.fake === true;
}

function isRandomSpy(apis, node) {
  const spied = spiedMember(apis, node);
  return (
    spied?.target.type === 'Identifier' &&
    spied.target.name === 'Math' &&
    spied.property.value === 'random'
  );
}

function trackNetworkImport(bindings, node) {
  const allowed = NETWORK_MODULES.get(moduleName(node.source.value));
  if (allowed === undefined) {
    return;
  }
  for (const specifier of node.specifiers) {
    const imported = specifier.type === 'ImportSpecifier' ? specifier.imported.name : '*';
    bindings.set(specifier.local.name, { allowed, imported });
  }
}

function isGlobalFetch(sourceCode, callee, node) {
  return (
    callee.name === 'fetch' &&
    sourceCode
      .getScope(node)
      .references.some(
        (reference) =>
          reference.identifier === callee &&
          (reference.resolved === null || reference.resolved.defs.length === 0),
      )
  );
}

function isNetworkCall({ sourceCode, bindings }, node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    const binding = bindings.get(callee.name);
    return (
      isGlobalFetch(sourceCode, callee, node) ||
      (binding !== undefined && binding.allowed.has(binding.imported))
    );
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const binding = bindings.get(callee.object.name);
  return binding !== undefined && binding.allowed.has(callee.property.name);
}

function reportUnfaked(context, state, { clockCalls, randomCalls }) {
  const { fakeClock, fixRandom } = vocabularyOf(context);
  const unfaked = [
    ...(state.fakeClock ? [] : clockCalls.map((node) => ({ node, messageId: 'clock' }))),
    ...(state.randomSpy ? [] : randomCalls.map((node) => ({ node, messageId: 'random' }))),
  ];
  for (const report of unfaked) {
    context.report({ ...report, data: { fakeClock, fixRandom } });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep the real clock, randomness and network out of tests' },
    schema: [
      {
        type: 'object',
        properties: { network: { type: 'boolean' }, ...RUNNER_OPTION_PROPERTY },
        additionalProperties: false,
      },
    ],
    messages: {
      clock:
        'The real clock makes the test depend on when it runs. Pass the time in, or fake it with {{fakeClock}}.',
      random:
        'Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with {{fixRandom}}.',
      network: 'A unit test must not reach the network. Inject the client and fake it.',
    },
  },
  create(context) {
    const checksNetwork = context.options[0]?.network === true;
    const clockCalls = [];
    const randomCalls = [];
    const state = { fakeClock: false, randomSpy: false };
    const networkBindings = new Map();
    const network = { sourceCode: context.sourceCode, bindings: networkBindings };
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        trackNetworkImport(networkBindings, node);
      },
      NewExpression(node) {
        if (isNewDateWithoutArguments(node)) {
          clockCalls.push(node);
        }
        if (
          checksNetwork &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'WebSocket'
        ) {
          context.report({ node, messageId: 'network' });
        }
      },
      CallExpression(node) {
        if (isMemberCall(node, 'Date', 'now')) {
          clockCalls.push(node);
        }
        if (isMemberCall(node, 'Math', 'random')) {
          randomCalls.push(node);
        }
        state.fakeClock ||= isFakeClockSetup(apis, node);
        state.randomSpy ||= isRandomSpy(apis, node);
        if (checksNetwork && isNetworkCall(network, node)) {
          context.report({ node, messageId: 'network' });
        }
      },
      'Program:exit'() {
        reportUnfaked(context, state, { clockCalls, randomCalls });
      },
    };
  },
};
