import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, nameOf } from '../typed/node-views.mts';
import type { PluginLayout } from '../typed/policy-views.mts';
import { isFunctionNode, resolveFunction } from './constant-resolution.mts';
import { forEachNode } from './node/wrapper-calls.mts';

type Registration = TSESTree.CallExpression | TSESTree.NewExpression;
type ReportContext<MessageIds extends string> = Readonly<
  TSESLint.RuleContext<MessageIds, readonly unknown[]>
>;
type TestReport<MessageIds extends string> = {
  readonly messageId: MessageIds;
  readonly data?: Readonly<Record<string, unknown>>;
};

export { findVariable, resolveConstant, constantNumber } from './constant-resolution.mts';
export { describeWrapperCall, type WrapperCall } from './node/wrapper-calls.mts';
export {
  moduleBindings,
  importedCalleeName,
  subprocessBindings,
  describeSubprocess,
  gitSubcommand,
} from './subprocess-calls.mts';

export function memberName(node: TSESTree.Node): string | undefined {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const { property } = node;
  if (!node.computed) {
    return property.type === AST_NODE_TYPES.Identifier ? property.name : undefined;
  }
  return property.type === AST_NODE_TYPES.Literal && typeof property.value === 'string'
    ? property.value
    : undefined;
}

const mockRunnerNames = new Set(['vi', 'jest']);
const moduleMockMethods = new Set(['mock', 'doMock']);

export function mockedModuleSource(
  node: TSESTree.Node | undefined,
  runners: ReadonlySet<string> = mockRunnerNames,
): string | undefined {
  const callee = node?.type === AST_NODE_TYPES.CallExpression ? node.callee : undefined;
  const method = callee === undefined ? undefined : memberName(callee);
  const isMock =
    callee?.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    runners.has(callee.object.name) &&
    method !== undefined &&
    moduleMockMethods.has(method);
  const [argument] = isMock && node?.type === AST_NODE_TYPES.CallExpression ? node.arguments : [];
  const source = argument?.type === AST_NODE_TYPES.ImportExpression ? argument.source : argument;
  return source?.type === AST_NODE_TYPES.Literal && typeof source.value === 'string'
    ? source.value
    : undefined;
}

const browserTestModule = /^(?:@playwright\/|cypress(?:\/|$))/u;

export function isBrowserEndToEndTest({
  sources,
  projectFile,
  layout,
}: {
  readonly sources: readonly string[];
  readonly projectFile: string;
  readonly layout: PluginLayout;
}): boolean {
  return (
    sources.some((source) => browserTestModule.test(source)) || layout.isEndToEndTest(projectFile)
  );
}

export function propertyKeyName(property: TSESTree.Property): string | undefined {
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Identifier && !property.computed) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal ? String(key.value) : undefined;
}

export function isExpectCall(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'expect';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'expect'
  );
}

const PER_TEST_TESTS = new Set(['it', 'test']);
const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
const TEST_FACTORY_MEMBERS = new Set(['each', 'for', 'runIf', 'skipIf', 'extend']);
const REGISTRATION_FACTORIES = new Set([...TEST_FACTORY_MEMBERS, 'todo']);

export function isTestFunctionName(name: string | undefined): boolean {
  return name !== undefined && TEST_FUNCTIONS.has(name);
}

export function isTestFactoryMember(name: string | undefined): boolean {
  return name !== undefined && TEST_FACTORY_MEMBERS.has(name);
}

export function registrationRoot(callee: TSESTree.Node): string | undefined {
  const root = chainOf<TSESTree.Node>(callee, (link) => {
    if (link.type === AST_NODE_TYPES.MemberExpression) {
      return link.object;
    }
    return link.type === AST_NODE_TYPES.CallExpression ? link.callee : undefined;
  }).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function isCallback(
  argument: TSESTree.CallExpressionArgument,
): argument is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return (
    argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    argument.type === AST_NODE_TYPES.FunctionExpression
  );
}

function perTestCallback(
  call: TSESTree.CallExpression,
  hooks: readonly string[] = ['beforeEach'],
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined {
  const root = registrationRoot(call.callee);
  if (root === undefined || !(PER_TEST_TESTS.has(root) || hooks.includes(root))) {
    return undefined;
  }
  const { callee } = call;
  const factory =
    callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
      ? nameOf(callee.property)
      : undefined;
  if (factory !== undefined && REGISTRATION_FACTORIES.has(factory)) {
    return undefined;
  }
  return [...call.arguments].reverse().find(isCallback);
}

export function perTestVisitors<MessageIds extends string>(
  context: ReportContext<MessageIds>,
  check: (node: Registration) => TestReport<MessageIds> | undefined,
  hooks?: readonly string[],
): { CallExpression: (registration: TSESTree.CallExpression) => void } {
  const reported = new Set<TSESTree.Node>();
  return {
    CallExpression(registration: TSESTree.CallExpression) {
      const callback = perTestCallback(registration, hooks);
      if (!callback) {
        return;
      }
      const visited = new Set<TSESTree.Node>([callback]);
      const pending = [callback.body];
      for (const body of pending) {
        forEachNode(context, body, (node) => {
          if (
            node.type !== AST_NODE_TYPES.CallExpression &&
            node.type !== AST_NODE_TYPES.NewExpression
          ) {
            return;
          }
          if (!reported.has(node)) {
            const report = check(node);
            if (report) {
              reported.add(node);
              context.report({ node, ...report });
            }
          }
          const fn =
            node.type === AST_NODE_TYPES.CallExpression
              ? resolveFunction(context, node.callee)
              : undefined;
          if (isFunctionNode(fn) && !visited.has(fn)) {
            visited.add(fn);
            pending.push(fn.body);
          }
        });
      }
    },
  };
}
