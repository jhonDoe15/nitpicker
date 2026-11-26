import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { constantNumber, isExpectCall } from '../../analysis/test-code-analysis.mts';
import { createRunnerApis, runnerApiVisitors } from '../../runner-apis/runner-apis.mts';
import { fakeTimerChange, setsFakeClock } from '../../runner-apis/runner-doubles.mts';
import { nameOf } from '../../typed/node-views.mts';
import { isTrue } from '../../cancellation/abort-signal/loop-check.mts';
import { isMeasuredDuration, replacesClock } from './clock-durations.mts';

type Context = Readonly<TSESLint.RuleContext<'wallClockBound', []>>;
type Bound = {
  readonly node: TSESTree.Node;
  readonly duration: TSESTree.Node;
  readonly limit: TSESTree.Node;
};

const LIMIT_MS = 1000;
const UPPER_MATCHERS = new Set([
  'toBeLessThan',
  'toBeLessThanOrEqual',
  'below',
  'lessThan',
  'lt',
  'most',
]);
const TRUE_MATCHERS = new Set(['toBe', 'toBeTruthy', 'toEqual', 'toStrictEqual']);
const LESS = new Set(['<', '<=']);
const GREATER = new Set(['>', '>=']);
const ASSERT = 'assert';
const ASSERTS = new Set([ASSERT, 'ok', 'isTrue']);
const BENCHMARK_FILE = /\.bench\.[cm]?[jt]sx?$/u;

function expectSubject(node: TSESTree.Node): TSESTree.Node | undefined {
  const calls = [node];
  for (const current of calls) {
    if (isExpectCall(current) && current.type === AST_NODE_TYPES.CallExpression) {
      return current.arguments[0];
    }
    if (current.type === AST_NODE_TYPES.MemberExpression && nameOf(current.property) !== 'not') {
      calls.push(current.object);
    }
  }
  return undefined;
}

function comparison(node: TSESTree.Node | undefined): Bound | undefined {
  if (
    node?.type !== AST_NODE_TYPES.BinaryExpression ||
    node.left.type === AST_NODE_TYPES.PrivateIdentifier
  ) {
    return undefined;
  }
  if (LESS.has(node.operator)) {
    return { node, duration: node.left, limit: node.right };
  }
  return GREATER.has(node.operator) ? { node, duration: node.right, limit: node.left } : undefined;
}

function matcherBound(call: TSESTree.CallExpression): Bound | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const matcher = nameOf(callee.property) ?? '';
  const subject = expectSubject(callee.object);
  const [argument] = call.arguments;
  if (subject === undefined) {
    return undefined;
  }
  if (UPPER_MATCHERS.has(matcher) && argument !== undefined) {
    return { node: call, duration: subject, limit: argument };
  }
  const truthy = TRUE_MATCHERS.has(matcher) && (argument === undefined || isTrue(argument));
  return truthy ? comparison(subject) : undefined;
}

function assertBound(call: TSESTree.CallExpression): Bound | undefined {
  const { callee } = call;
  const name =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.object) : ASSERT;
  return ASSERTS.has(name ?? '') && owner === ASSERT ? comparison(call.arguments[0]) : undefined;
}

function isTightBound(context: Context, { duration, limit }: Bound): boolean {
  const value = constantNumber(context, limit);
  return value !== undefined && value < LIMIT_MS && isMeasuredDuration(context, duration);
}

export const rule: TSESLint.RuleModule<'wallClockBound'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep upper bounds on measured run time out of tests' },
    schema: [],
    messages: {
      wallClockBound:
        'This test asserts that measured time stays under a limit below one second, so it fails whenever the machine is slow: a busy CI runner, a garbage collection pause or a cold cache pushes the time over the limit. Assert the behaviour instead (the calls made, or the work counted), and keep speed checks in a benchmark.',
    },
  },
  create(context) {
    if (BENCHMARK_FILE.test(context.filename)) {
      return {};
    }
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const bounds: Bound[] = [];
    let fakeClock = false;
    return {
      ...visitors,
      CallExpression(node) {
        fakeClock ||=
          setsFakeClock(apis, node) ||
          fakeTimerChange(apis, node)?.fake === true ||
          replacesClock(node);
        const bound = matcherBound(node) ?? assertBound(node);
        if (bound !== undefined) {
          bounds.push(bound);
        }
      },
      AssignmentExpression(node) {
        visitors.AssignmentExpression(node);
        fakeClock ||= replacesClock(node);
      },
      'Program:exit'() {
        for (const bound of fakeClock ? [] : bounds) {
          if (isTightBound(context, bound)) {
            context.report({ node: bound.node, messageId: 'wallClockBound' });
          }
        }
      },
    };
  },
};
