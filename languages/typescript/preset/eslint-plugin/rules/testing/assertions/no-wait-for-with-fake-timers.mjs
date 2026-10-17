import { ancestorsOf, chainOf } from '../../analysis/ancestry.mjs';
import { createRunnerApis, runnerApiVisitors } from '../runners/runner-apis.mjs';
import { fakeTimerChange, waitKind } from '../runners/runner-doubles.mjs';

const TEARDOWN_HOOKS = ['afterEach', 'afterAll', 'after'];
const WAIT_MESSAGES = { node: 'mockedWait', sinon: 'clockWait' };
function callName(node) {
  if (node?.type !== 'CallExpression') return undefined;
  const callee = node.callee;
  const root = chainOf(callee, (current) => {
    if (current.type === 'CallExpression') return current.callee;
    return current.type === 'MemberExpression' ? current.object : undefined;
  }).at(-1);
  if (root.type === 'Identifier' && ['it', 'test', 'describe'].includes(root.name))
    return root.name;
  if (callee.type === 'Identifier') return callee.name;
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function owner(node) {
  for (const current of ancestorsOf(node)) {
    if (current.type === 'Program') return current;
    if (current.type !== 'CallExpression') continue;
    if (['it', 'test', 'describe'].includes(callName(current))) return current;
  }
  return undefined;
}

function isInTeardown(node) {
  return ancestorsOf(node).some((current) => TEARDOWN_HOOKS.includes(callName(current)));
}

function governingChange(changes, wait) {
  for (const scope of chainOf(owner(wait), owner)) {
    const candidates = changes.filter(
      (change) =>
        change.owner === scope &&
        (callName(scope) === 'describe' ||
          scope.type === 'Program' ||
          change.node.range[0] < wait.range[0]),
    );
    if (candidates.length > 0) return candidates.at(-1);
  }
  return undefined;
}

function isFakeWait(wait, change) {
  if (!change?.fake) {
    return false;
  }
  return wait.kind === 'vitest' ? change.kind === 'vitest' : change.kind !== 'vitest';
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      fakeWait:
        'Use an explicit completion signal or advanceTimersByTimeAsync and a direct assertion; waitFor advances fake time.',
      mockedWait:
        'Use an explicit completion signal or mock.timers.tick and a direct assertion; waitFor polls on timers that mock.timers has replaced, so it never settles.',
      clockWait:
        'Use an explicit completion signal or `await clock.tickAsync(ms)` and a direct assertion; waitFor polls on timers that the sinon fake clock has replaced, so it never settles.',
    },
  },
  create(context) {
    const apis = createRunnerApis();
    const changes = [];
    const waits = [];
    return {
      ...runnerApiVisitors(apis),
      CallExpression(node) {
        const kind = waitKind(apis, node);
        if (kind !== undefined) {
          waits.push({ node, kind });
        }
        const change = fakeTimerChange(apis, node);
        if (change === undefined || isInTeardown(node)) {
          return;
        }
        changes.push({ node, owner: owner(node), ...change });
      },
      'Program:exit'() {
        for (const wait of waits) {
          const change = governingChange(changes, wait.node);
          if (isFakeWait(wait, change)) {
            context.report({
              node: wait.node,
              messageId: WAIT_MESSAGES[change.kind] ?? 'fakeWait',
            });
          }
        }
      },
    };
  },
};
