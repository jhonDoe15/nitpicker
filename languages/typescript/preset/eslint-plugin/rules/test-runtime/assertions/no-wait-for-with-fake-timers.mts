import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf } from '../../typed/node-views.mts';
import { createRunnerApis, runnerApiVisitors } from '../../runner-apis/runner-apis.mts';
import { type TimerChange, fakeTimerChange, waitKind } from '../../runner-apis/runner-doubles.mts';

type MessageId = 'fakeWait' | 'mockedWait' | 'clockWait';
type Change = TimerChange & {
  readonly node: TSESTree.CallExpression;
  readonly owner: TSESTree.Node | undefined;
};
type Wait = { readonly node: TSESTree.CallExpression; readonly kind: string };

const TEST_BLOCKS = ['it', 'test', 'describe'];
const TEARDOWN_HOOKS = ['afterEach', 'afterAll', 'after'];
const WAIT_MESSAGES: Readonly<Record<string, MessageId>> = {
  node: 'mockedWait',
  sinon: 'clockWait',
};

function callName(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = node.callee;
  const root = chainOf<TSESTree.Node>(callee, (current) => {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      return current.callee;
    }
    return current.type === AST_NODE_TYPES.MemberExpression ? current.object : undefined;
  }).at(-1);
  if (root?.type === AST_NODE_TYPES.Identifier && TEST_BLOCKS.includes(root.name)) {
    return root.name;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? callee.property.name
    : undefined;
}

function owner(node: TSESTree.Node): TSESTree.Node | undefined {
  for (const current of ancestorsOf(node)) {
    if (current.type === AST_NODE_TYPES.Program) {
      return current;
    }
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const name = callName(current);
    if (name !== undefined && TEST_BLOCKS.includes(name)) {
      return current;
    }
  }
  return undefined;
}

function isInTeardown(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some((current) => {
    const name = callName(current);
    return name !== undefined && TEARDOWN_HOOKS.includes(name);
  });
}

function governingChange(
  changes: readonly Change[],
  wait: TSESTree.CallExpression,
): Change | undefined {
  for (const scope of chainOf<TSESTree.Node>(owner(wait), owner)) {
    const candidates = changes.filter(
      (change) =>
        change.owner === scope &&
        (callName(scope) === 'describe' ||
          scope.type === AST_NODE_TYPES.Program ||
          change.node.range[0] < wait.range[0]),
    );
    if (candidates.length > 0) {
      return candidates.at(-1);
    }
  }
  return undefined;
}

function isFakeWait(wait: Wait, change: Change | undefined): change is Change {
  if (change?.fake !== true) {
    return false;
  }
  return wait.kind === 'vitest' ? change.kind === 'vitest' : change.kind !== 'vitest';
}

export const rule: TSESLint.RuleModule<MessageId> = {
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
    const changes: Change[] = [];
    const waits: Wait[] = [];
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
