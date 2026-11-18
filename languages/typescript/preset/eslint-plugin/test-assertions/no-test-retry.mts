import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf } from '../rules/typed/node-views.mts';
import { fixable } from '../fixes/support/descriptors.mts';
import { retryFix } from '../fixes/tests/test-retry-fix.mts';
import {
  constantNumber,
  isTestFactoryMember,
  isTestFunctionName,
  memberName,
  moduleBindings,
  propertyKeyName,
  registrationRoot,
  resolveConstant,
} from '../rules/analysis/test-code-analysis.mts';
import { isFunctionNode } from '../rules/analysis/constant-resolution.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

type Context = Readonly<TSESLint.RuleContext<'retry', []>>;
type Bindings = ReturnType<typeof moduleBindings>;

const TEST_MODULES = new Set(['vitest', '@jest/globals', '@playwright/test', 'mocha']);
const MOCHA_REGISTRATIONS = new Set([
  'it',
  'test',
  'describe',
  'suite',
  'context',
  'specify',
  'before',
  'after',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'suiteSetup',
  'suiteTeardown',
  'setup',
  'teardown',
]);
const RETRY_KEYS = new Set(['retry', 'retries']);
const CONFIGURE_PATH = /^test\.describe(?:\.(?:serial|parallel|default))?\.configure$/u;

function canonical(bindings: Bindings, name: string | undefined): string | undefined {
  return name === undefined ? undefined : (bindings.named.get(name) ?? name);
}

function memberPath(callee: TSESTree.Node, bindings: Bindings): string {
  const links = chainOf(callee, (link) =>
    link.type === AST_NODE_TYPES.MemberExpression && memberName(link) !== undefined
      ? link.object
      : undefined,
  );
  const root = links.at(-1);
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return '';
  }
  const members = links.slice(0, -1).map(memberName);
  return [canonical(bindings, root.name), ...members.toReversed()].join('.');
}

function isOff(context: Context, node: TSESTree.Node): boolean {
  const value = resolveConstant(context, node);
  return (
    constantNumber(context, node) === 0 ||
    (value?.type === AST_NODE_TYPES.Literal && (value.value === false || value.value === null)) ||
    (value?.type === AST_NODE_TYPES.Identifier && value.name === 'undefined')
  );
}

function retryLeaves(context: Context, node: TSESTree.Node): TSESTree.Node[] {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return [node];
  }
  return resolved.properties.map((property) =>
    property.type === AST_NODE_TYPES.Property ? property.value : property,
  );
}

function isOffEverywhere(context: Context, node: TSESTree.Node): boolean {
  return retryLeaves(context, node).every((leaf) => isOff(context, leaf));
}

function isRetryProperty(property: TSESTree.ObjectLiteralElement): property is TSESTree.Property {
  return (
    property.type === AST_NODE_TYPES.Property && RETRY_KEYS.has(propertyKeyName(property) ?? '')
  );
}

function objectEntries(resolved: TSESTree.Node): {
  spreads: TSESTree.SpreadElement[];
  retries: TSESTree.Property[];
} {
  const properties = resolved.type === AST_NODE_TYPES.ObjectExpression ? resolved.properties : [];
  return {
    spreads: properties.filter((property) => property.type === AST_NODE_TYPES.SpreadElement),
    retries: properties.filter(isRetryProperty),
  };
}

function retryValues(context: Context, node: TSESTree.Node | undefined): TSESTree.Node[] {
  const pending = [node];
  const seen = new Set<TSESTree.Node>();
  const values: TSESTree.Node[] = [];
  for (const current of pending) {
    const resolved = resolveConstant(context, current);
    if (!resolved || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    const { spreads, retries } = objectEntries(resolved);
    if (resolved.type === AST_NODE_TYPES.ConditionalExpression) {
      pending.push(resolved.consequent, resolved.alternate);
    }
    appendAll(
      pending,
      spreads.map((spread) => spread.argument),
    );
    appendAll(
      values,
      retries.map((property) => property.value),
    );
  }
  return values;
}

function isMochaFunctionCall(node: TSESTree.Node, bindings: Bindings): boolean {
  const holder = ancestorsOf(node).find(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.FunctionExpression ||
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration,
  );
  if (
    holder?.type !== AST_NODE_TYPES.FunctionExpression ||
    holder.parent.type !== AST_NODE_TYPES.CallExpression
  ) {
    return false;
  }
  const root = registrationRoot(holder.parent.callee);
  return (
    holder.parent.arguments.includes(holder) &&
    MOCHA_REGISTRATIONS.has(canonical(bindings, root) ?? '')
  );
}

function isThisRetries(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.ThisExpression &&
    memberName(callee) === 'retries'
  );
}

function isTestRegistration(callee: TSESTree.Node, bindings: Bindings): boolean {
  if (!isTestFunctionName(canonical(bindings, registrationRoot(callee)))) {
    return false;
  }
  return !(
    callee.type === AST_NODE_TYPES.MemberExpression && isTestFactoryMember(memberName(callee))
  );
}

function retryNodes(
  context: Context,
  node: TSESTree.CallExpression,
  bindings: Bindings,
): TSESTree.Node[] {
  const path = memberPath(node.callee, bindings);
  if (path === 'vi.setConfig' || CONFIGURE_PATH.test(path)) {
    return retryValues(context, node.arguments[0]);
  }
  if (path === 'jest.retryTimes') {
    return node.arguments.slice(0, 1);
  }
  if (isThisRetries(node.callee)) {
    return isMochaFunctionCall(node, bindings) ? node.arguments.slice(0, 1) : [];
  }
  if (!isTestRegistration(node.callee, bindings)) {
    return [];
  }
  return node.arguments
    .slice(1)
    .filter((argument) => !isFunctionNode(argument))
    .flatMap((argument) => retryValues(context, argument));
}

export const rule: TSESLint.RuleModule<'retry'> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      retry:
        'Remove the retry: a test that passes on a later attempt hides a flaky or racy test. Fix the cause, such as waiting on the condition instead of a delay or isolating shared state.',
    },
  },
  create(context) {
    const bindings = moduleBindings(context.sourceCode.ast, TEST_MODULES);
    const reported = new WeakSet<TSESTree.Node>();
    return {
      CallExpression(node) {
        for (const retry of retryNodes(context, node, bindings)) {
          if (!(reported.has(retry) || isOffEverywhere(context, retry))) {
            reported.add(retry);
            context.report(
              fixable({ node: retry, messageId: 'retry' }, retryFix(context.sourceCode, retry)),
            );
          }
        }
      },
    };
  },
};
