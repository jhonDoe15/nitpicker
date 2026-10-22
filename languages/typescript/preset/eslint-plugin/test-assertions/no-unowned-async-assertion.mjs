import { depthFirst, objectChildren } from '../../../../../shared/traversal.mjs';
import { ancestorsOf, chainOf } from '../rules/analysis/ancestry.mjs';
import { callbackOf, enclosingFunction, isCaseCall } from '../test-quality/test-calls.mjs';

const TIMERS = new Set(['setTimeout', 'setImmediate', 'queueMicrotask', 'nextTick']);
const TIMER_OWNERS = new Set(['globalThis', 'global', 'window', 'self', 'process', 'timers']);
const LISTENERS = new Set([
  'on',
  'once',
  'addListener',
  'prependListener',
  'prependOnceListener',
  'addEventListener',
]);
const CLOCK_ADVANCES = new Set([
  'advanceTimersByTime',
  'advanceTimersByTimeAsync',
  'advanceTimersToNextTimer',
  'advanceTimersToNextTimerAsync',
  'advanceTimersToNextFrame',
  'runAllTimers',
  'runAllTimersAsync',
  'runOnlyPendingTimers',
  'runOnlyPendingTimersAsync',
  'runAllTicks',
  'runAll',
  'runAllAsync',
  'runToLast',
  'runToLastAsync',
  'runMicrotasks',
  'tick',
  'tickAsync',
]);
const ERROR_PARAMETERS = new Set(['err', 'error', 'er']);
const ASSERTION_ROOTS = new Set(['expect', 'assert', 'should']);
const COMPLETION_ANCESTORS = new Set(['AwaitExpression', 'ReturnStatement', 'YieldExpression']);
const EXCEPTION_HINT =
  'An exception fits only when the test waits for the callback in a way nitpicker cannot see.';

function propertyName(node) {
  return node.type === 'MemberExpression' && !node.computed ? node.property.name : undefined;
}

function calleeLinks(callee) {
  return chainOf(callee, (current) => {
    if (current.type === 'CallExpression') {
      return current.callee;
    }
    return current.type === 'MemberExpression' ? current.object : undefined;
  });
}

function isAssertion(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const links = calleeLinks(node.callee);
  const root = links.at(-1);
  return (
    (root?.type === 'Identifier' && ASSERTION_ROOTS.has(root.name)) ||
    links.some((link) => ['assert', 'should'].includes(propertyName(link)))
  );
}

function nodesUnder(root) {
  return [...depthFirst(root, objectChildren)].filter((node) => typeof node.type === 'string');
}

function isTimerCallee(callee) {
  if (callee.type === 'Identifier') {
    return TIMERS.has(callee.name);
  }
  return (
    TIMERS.has(propertyName(callee)) &&
    callee.object.type === 'Identifier' &&
    TIMER_OWNERS.has(callee.object.name)
  );
}

function asserts(callback) {
  return nodesUnder(callback.body).some(isAssertion);
}

function isFunction(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function errorFirst(callback) {
  const [first] = callback.params;
  return first?.type === 'Identifier' && ERROR_PARAMETERS.has(first.name);
}

function hostKind(call) {
  const callbacks = call.arguments.filter((argument) => isFunction(argument) && asserts(argument));
  if (callbacks.length === 0) {
    return undefined;
  }
  if (isTimerCallee(call.callee)) {
    return 'timer';
  }
  if (LISTENERS.has(propertyName(call.callee))) {
    return 'listener';
  }
  return callbacks.some(errorFirst) ? 'callback' : undefined;
}

function hostName(callee) {
  return callee.type === 'Identifier' ? callee.name : propertyName(callee);
}

function isOwnedByCompletion(host, test) {
  const ancestors = ancestorsOf(host);
  return ancestors
    .slice(0, ancestors.indexOf(test))
    .some((ancestor) => COMPLETION_ANCESTORS.has(ancestor.type));
}

function calledNames(nodes) {
  return new Set(
    nodes.flatMap((node) => {
      if (node.type !== 'CallExpression') {
        return [];
      }
      const passed = node.arguments.filter((argument) => argument.type === 'Identifier');
      const called = node.callee.type === 'Identifier' ? [node.callee] : [];
      return [...called, ...passed].map((identifier) => identifier.name);
    }),
  );
}

function plansAssertions(nodes) {
  return nodes.some(
    (node) =>
      node.type === 'CallExpression' &&
      ['assertions', 'plan'].includes(propertyName(node.callee)) &&
      node.arguments.length > 0,
  );
}

function hasDoneOrPlan(test, nodes) {
  const called = calledNames(nodes);
  const takesDone = test.params.some(
    (parameter) => parameter.type === 'Identifier' && called.has(parameter.name),
  );
  return takesDone || plansAssertions(nodes);
}

function after(host, nodes) {
  return nodes.filter((node) => node.range[0] >= host.range[1]);
}

function advancesClock(later) {
  return later.some(
    (node) => node.type === 'CallExpression' && CLOCK_ADVANCES.has(propertyName(node.callee)),
  );
}

function mayTriggerLater(later) {
  return later.some((node) => node.type === 'CallExpression' || node.type === 'AwaitExpression');
}

function isUnowned(kind, later) {
  if (kind === 'timer') {
    return !advancesClock(later);
  }
  if (kind === 'listener') {
    return !mayTriggerLater(later);
  }
  return true;
}

function unownedHosts(test) {
  const nodes = nodesUnder(test.body);
  if (hasDoneOrPlan(test, nodes)) {
    return [];
  }
  return nodes.flatMap((node) => {
    if (node.type !== 'CallExpression' || enclosingFunction(node) !== test) {
      return [];
    }
    const kind = hostKind(node);
    if (kind === undefined || isOwnedByCompletion(node, test)) {
      return [];
    }
    const later = after(node, nodes).filter((candidate) => !isAssertion(candidate));
    return isUnowned(kind, later) ? [{ node, kind }] : [];
  });
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require tests to wait for the callbacks that hold their assertions' },
    schema: [],
    messages: {
      timer: `This assertion runs in a \`{{host}}\` callback, which runs after the test function returns unless the test advances a fake clock, so its failure is lost or blamed on another test. Fake the timers and advance them past it in the test, or await a promise the callback resolves. ${EXCEPTION_HINT}`,
      listener: `This assertion runs in a \`{{host}}\` listener that is the test's last step, so the event can only arrive after the test has finished and its failure is lost or blamed on another test. Trigger the event in the test after adding the listener, or await it (\`await once(emitter, 'ready')\`, or a promise the listener resolves). ${EXCEPTION_HINT}`,
      callback: `This assertion runs in an error-first callback, which Node-style APIs call after the test function returns, so its failure is lost or blamed on another test. Await the promise form of the API (\`node:fs/promises\`, \`util.promisify\`), or take the runner's \`done\` callback and call it from the callback. ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const test = isCaseCall(node) ? callbackOf(node) : undefined;
        if (test === undefined || test.body.type !== 'BlockStatement') {
          return;
        }
        for (const { node: host, kind } of unownedHosts(test)) {
          context.report({
            node: host.callee,
            messageId: kind,
            data: { host: hostName(host.callee) },
          });
        }
      },
    };
  },
};
