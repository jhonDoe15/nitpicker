import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { createRunnerApis, runnerApiVisitors } from '../../rules/runner-apis/runner-apis.mts';
import { ancestorsOf, contains } from '../../rules/typed/node-views.mts';
import { callbackOf, chainHasProperty, isSuiteCall, testCallback } from '../test-calls.mts';
import { envWrite, workerStateCall } from './worker-state.mts';

type Options = readonly [{ readonly concurrent?: boolean }?];
type Owner = {
  readonly call: TSESTree.CallExpression;
  readonly body: TSESTree.Node;
  readonly hook: boolean;
  readonly concurrent: boolean;
};
type Change = { readonly node: TSESTree.Node; readonly owner: Owner; readonly what: string };

const EACH_HOOKS = new Set(['beforeEach', 'afterEach']);
const REPEATED_CASES = ['each', 'for'];
const REPEATED_WEIGHT = 2;
const SWITCHED_OFF = ['skip', 'todo'];
const ENV_WRITE = 'the write to `process.env`';

function optionIs(call: TSESTree.CallExpression, name: string, value: boolean): boolean {
  return call.arguments.some(
    (argument) =>
      argument.type === AST_NODE_TYPES.ObjectExpression &&
      argument.properties.some(
        (property) =>
          property.type === AST_NODE_TYPES.Property &&
          property.key.type === AST_NODE_TYPES.Identifier &&
          property.key.name === name &&
          property.value.type === AST_NODE_TYPES.Literal &&
          property.value.value === value,
      ),
  );
}

function modeOf(call: TSESTree.CallExpression): boolean | undefined {
  if (
    chainHasProperty(call.callee, 'sequential') ||
    optionIs(call, 'sequential', true) ||
    optionIs(call, 'concurrent', false)
  ) {
    return false;
  }
  return chainHasProperty(call.callee, 'concurrent') || optionIs(call, 'concurrent', true)
    ? true
    : undefined;
}

function isSwitchedOff(call: TSESTree.CallExpression): boolean {
  return SWITCHED_OFF.some((name) => chainHasProperty(call.callee, name));
}

function suiteOf(call: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(call).find((ancestor) => isSuiteCall(ancestor));
}

function runsConcurrently(call: TSESTree.CallExpression, byDefault: boolean): boolean {
  const own = modeOf(call);
  if (own !== undefined) {
    return own;
  }
  const suite = ancestorsOf(call)
    .filter((ancestor) => isSuiteCall(ancestor))
    .map((ancestor) => (isSuiteCall(ancestor) ? modeOf(ancestor) : undefined))
    .find((mode) => mode !== undefined);
  return suite ?? byDefault;
}

function eachHookBody(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  return call.callee.type === AST_NODE_TYPES.Identifier && EACH_HOOKS.has(call.callee.name)
    ? callbackOf(call)
    : undefined;
}

function hookContainer(call: TSESTree.CallExpression): TSESTree.Node {
  return call.parent.parent ?? call;
}

function weightOf(owner: Owner): number {
  return REPEATED_CASES.some((name) => chainHasProperty(owner.call.callee, name))
    ? REPEATED_WEIGHT
    : 1;
}

export const rule: TSESLint.RuleModule<'workerState', Options> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report fake timers, spies, stubs, environment writes and shared mock setups in tests that run concurrently',
    },
    schema: [
      {
        type: 'object',
        properties: { concurrent: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      workerState:
        'Concurrent tests interleave in one worker, so {{what}} is also live in the other concurrent tests of this file while they await, and which test sees it depends on timing. Run the tests that change worker-wide state in sequence (`describe.sequential`, or drop `.concurrent`), or keep the state inside the test.',
    },
  },
  create(context) {
    const byDefault = context.options[0]?.concurrent === true;
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const owners: Owner[] = [];
    const changes: Change[] = [];
    const { sourceCode } = context;

    function ownerOf(node: TSESTree.Node): Owner | undefined {
      return owners.findLast((owner) => contains(owner.body, node));
    }

    function remember(node: TSESTree.Node, what: string | undefined): void {
      const owner = what === undefined ? undefined : ownerOf(node);
      if (owner !== undefined && what !== undefined) {
        changes.push({ node, owner, what });
      }
    }

    function concurrentTestsBeside(suite: TSESTree.Node | undefined): number {
      return owners
        .filter((test) => !test.hook && test.concurrent && suiteOf(test.call) === suite)
        .reduce((total, test) => total + weightOf(test), 0);
    }

    function runsBesideOthers(owner: Owner): boolean {
      if (!owner.hook) {
        return owner.concurrent && concurrentTestsBeside(suiteOf(owner.call)) >= 2;
      }
      const container = hookContainer(owner.call);
      return owners.some(
        (test) =>
          !test.hook &&
          test.concurrent &&
          contains(container, test.call) &&
          concurrentTestsBeside(suiteOf(test.call)) >= 2,
      );
    }

    return {
      ...visitors,
      CallExpression(node) {
        const test = testCallback(context, node);
        const hook = test === undefined ? eachHookBody(node) : undefined;
        const body = test ?? hook;
        if (body !== undefined) {
          const concurrent =
            test !== undefined && !isSwitchedOff(node) && runsConcurrently(node, byDefault);
          owners.push({ call: node, body, hook: hook !== undefined, concurrent });
        }
        const owner = ownerOf(node);
        remember(
          node,
          owner === undefined
            ? undefined
            : workerStateCall(apis, sourceCode, { call: node, owner: owner.body }),
        );
      },
      AssignmentExpression(node) {
        visitors.AssignmentExpression(node);
        remember(node, envWrite(sourceCode, node.left) ? ENV_WRITE : undefined);
      },
      UnaryExpression(node) {
        remember(
          node,
          node.operator === 'delete' && envWrite(sourceCode, node.argument) ? ENV_WRITE : undefined,
        );
      },
      'Program:exit'() {
        for (const { node, owner, what } of changes) {
          if (runsBesideOthers(owner)) {
            context.report({ node, messageId: 'workerState', data: { what } });
          }
        }
      },
    };
  },
};
