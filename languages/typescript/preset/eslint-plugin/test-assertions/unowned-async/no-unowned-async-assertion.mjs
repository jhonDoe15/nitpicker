import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { callbackOf, chainHasProperty, isCaseCall } from '../../test-quality/test-calls.mjs';
import { isInsideCompletedPromise, isOwnedByPlan, takesDone } from './completion.mjs';
import { fileBindings, hostOf, isAssertion } from './hosts.mjs';
import { isOwnedByLaterStep, nodesIn, stepFacts } from './later-steps.mjs';

const NOT_TESTS = [
  'step',
  'describe',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'use',
  'extend',
];
const EXCEPTION_HINT =
  'An exception fits only when the test waits for the callback in a way nitpicker cannot see.';
const LOST = 'a failure is lost or blamed on another test';

function testCallback(call) {
  if (!isCaseCall(call) || NOT_TESTS.some((name) => chainHasProperty(call.callee, name))) {
    return undefined;
  }
  return callbackOf(call);
}

function anchorIndex(host, test) {
  if (test.body.type !== 'BlockStatement') {
    return -1;
  }
  const anchor = [host.node, ...ancestorsOf(host.node)].find((node) => node.parent === test.body);
  return test.body.body.indexOf(anchor);
}

function insideOtherHost(host, hosts) {
  const ancestors = new Set(ancestorsOf(host.node));
  return hosts.some(
    (other) => other !== host && other.callbacks.some((callback) => ancestors.has(callback)),
  );
}

function assertsIn(context, callback, bindings) {
  return nodesIn(context, callback.body, { intoFunctions: true }).some((node) =>
    isAssertion(node, bindings),
  );
}

function testHosts(context, test, bindings) {
  const nodes = nodesIn(context, test.body, { intoFunctions: true });
  const hosts = nodes
    .map((node) =>
      hostOf(context, node, {
        bindings,
        asserts: (callback) => assertsIn(context, callback, bindings),
      }),
    )
    .filter((host) => host !== undefined);
  const inHosts = new Set(
    hosts.flatMap((host) =>
      host.callbacks.flatMap((callback) => nodesIn(context, callback, { intoFunctions: true })),
    ),
  );
  const syncAssertions = nodes.filter(
    (node) => !inHosts.has(node) && isAssertion(node, bindings),
  ).length;
  return { hosts: hosts.filter((host) => !insideOtherHost(host, hosts)), syncAssertions };
}

function unownedHosts(context, call, bindings) {
  const test = testCallback(call);
  if (test === undefined || takesDone(context, test, call)) {
    return [];
  }
  const { hosts, syncAssertions } = testHosts(context, test, bindings);
  if (hosts.length === 0 || isOwnedByPlan(test, syncAssertions)) {
    return [];
  }
  const statements = test.body.type === 'BlockStatement' ? test.body.body : [];
  const facts = new Map(statements.map((statement) => [statement, undefined]));
  function factsOf(statement) {
    facts.set(statement, facts.get(statement) ?? stepFacts(context, statement));
    return facts.get(statement);
  }
  return hosts.filter((host) => {
    if (isInsideCompletedPromise(context, host, test)) {
      return false;
    }
    const anchor = anchorIndex(host, test);
    const later = anchor === -1 ? [] : statements.slice(anchor + 1);
    return !isOwnedByLaterStep(host, later.map(factsOf));
  });
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require tests to wait for the callbacks that hold their assertions' },
    schema: [],
    messages: {
      timer: `This assertion runs in a \`{{host}}\` callback the test does not wait for: the test function returns first, so ${LOST}. Await a promise the callback resolves, or fake the timers and advance them past it in the test. ${EXCEPTION_HINT}`,
      microtask: `This assertion runs in a \`{{host}}\` callback the test does not wait for: the test function returns first, so ${LOST}. Await a promise the callback resolves, or \`await\` after scheduling it so it runs before the test ends. ${EXCEPTION_HINT}`,
      listener: `This assertion runs in a \`{{host}}\` handler, and nothing after it in the test triggers the event or waits for it, so the event can arrive after the test has finished and ${LOST}. Trigger the event in the test after adding the handler, or await it (\`await once(emitter, 'ready')\`, or a promise the handler resolves). ${EXCEPTION_HINT}`,
      callback: `This assertion runs in the callback of \`{{host}}\`, which Node calls after the test function returns, so ${LOST}. Await the promise form of the API (\`node:fs/promises\`, \`util.promisify\`) instead. ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    const bindings = fileBindings(context.sourceCode.ast);
    return {
      CallExpression(call) {
        for (const host of unownedHosts(context, call, bindings)) {
          context.report({ node: host.node, messageId: host.kind, data: { host: host.name } });
        }
      },
    };
  },
};
