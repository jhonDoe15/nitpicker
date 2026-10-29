import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { isFunctionNode } from '../../rules/analysis/constant-resolution.mjs';
import { isNestedTest, testCallback } from '../../test-quality/test-calls.mjs';
import { isInsideCompletedPromise, isInsideScheduler } from './completion.mjs';
import { fileBindings, hostOf } from './hosts.mjs';
import { isOwnedByLaterStep, ownerRoots, stepFacts } from './later-steps.mjs';
import { countsAsAssertion, isAssertion, nodesIn } from './nodes.mjs';
import { isOwnedByPlan, takesDone } from './plans.mjs';

const EXCEPTION_HINT =
  'An exception fits only when the test waits for the callback in a way nitpicker cannot see.';
const LOST = 'a failure is lost or blamed on another test';

function insideOtherHost(host, hosts) {
  const ancestors = new Set(ancestorsOf(host.node));
  return hosts.some(
    (other) => other !== host && other.callbacks.some((callback) => ancestors.has(callback)),
  );
}

function assertsIn(env, callback) {
  return nodesIn(env.context, callback.body).some((node) => isAssertion(node, env.bindings));
}

function testHosts(env, test) {
  const { context, bindings } = env;
  const nodes = nodesIn(context, test.body, (child) => !isNestedTest(context, child));
  const hosts = nodes
    .map((node) =>
      hostOf(context, node, { bindings, asserts: (callback) => assertsIn(env, callback) }),
    )
    .filter((host) => host !== undefined);
  const inHosts = new Set(
    hosts.flatMap((host) => host.callbacks.flatMap((callback) => nodesIn(context, callback))),
  );
  const syncAssertions = nodes.filter(
    (node) => !inHosts.has(node) && countsAsAssertion(node, bindings),
  ).length;
  return { hosts: hosts.filter((host) => !insideOtherHost(host, hosts)), syncAssertions };
}

function isOwned(env, host, test) {
  if (isInsideCompletedPromise(env.context, host, test) || isInsideScheduler(host, test)) {
    return true;
  }
  const owners = new Set(ancestorsOf(host.node).filter(isFunctionNode));
  const roots = ownerRoots(env.context, host, test);
  return isOwnedByLaterStep(host, stepFacts(env, roots, owners));
}

function unownedHosts(env, call) {
  const test = testCallback(env.context, call);
  if (test === undefined || takesDone(env, test, call)) {
    return [];
  }
  const { hosts, syncAssertions } = testHosts(env, test);
  if (hosts.length === 0 || isOwnedByPlan(test, syncAssertions)) {
    return [];
  }
  return hosts.filter((host) => !isOwned(env, host, test));
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
    const env = { context, bindings: fileBindings(context.sourceCode.ast) };
    return {
      CallExpression(call) {
        for (const host of unownedHosts(env, call)) {
          context.report({ node: host.node, messageId: host.kind, data: { host: host.name } });
        }
      },
    };
  },
};
