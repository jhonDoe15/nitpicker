import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import {
  constantNumber,
  registrationRoot,
  resolveConstant,
  isTestFactoryMember,
  isTestFunctionName,
} from '../../analysis/test-code-analysis.mts';
import { isIntegrationTestFor as untypedIsIntegrationTestFor } from '../../../../layout/end-to-end-tests.mjs';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import { raisedTimeoutFix } from '../../../fixes/tests/raised-timeout-fix.mts';
import { isFunctionNode, type SourceContext } from '../../analysis/constant-resolution.mts';
import {
  timeoutLimits,
  timeoutPolicy,
  type TimeoutLimits,
} from '../processes/timeouts/timeout-policy.mts';

type MessageId = 'raisedTimeout' | 'unknownTimeout' | 'dropTimeout';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type TimeoutNode = { readonly node: TSESTree.Node; readonly hook: boolean };
type TimeoutProperty = TSESTree.Property & { readonly key: TSESTree.Identifier };

const isIntegrationTestFor: (file: string, policy: Readonly<Record<string, unknown>>) => boolean =
  untypedIsIntegrationTestFor;

export { TEST_TIMEOUT_CEILING_MS } from '../../../../../../../shared/test-timeouts/resolve.mjs';

const HOOKS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
const HOOK_TIMEOUT_KEYS = ['hookTimeout', 'teardownTimeout'];
const TIMEOUT_KEYS = new Set(['timeout', 'testTimeout', 'hookTimeout', 'teardownTimeout']);

function timeoutProperties(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): TimeoutProperty[] {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return [];
  }
  return resolved.properties.filter(
    (property): property is TimeoutProperty =>
      property.type === AST_NODE_TYPES.Property &&
      !property.computed &&
      property.key.type === AST_NODE_TYPES.Identifier &&
      TIMEOUT_KEYS.has(property.key.name),
  );
}

function isSetConfig(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'vi' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'setConfig'
  );
}

function timeoutNodes(context: SourceContext, node: TSESTree.CallExpression): TimeoutNode[] {
  if (isSetConfig(node.callee)) {
    return timeoutProperties(context, node.arguments[0]).map((property) => ({
      node: property.value,
      hook: HOOK_TIMEOUT_KEYS.includes(property.key.name),
    }));
  }
  const root = registrationRoot(node.callee);
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    isTestFactoryMember(node.callee.property.name)
  ) {
    return [];
  }
  if (root !== undefined && HOOKS.has(root) && node.callee.type === AST_NODE_TYPES.Identifier) {
    return node.arguments.slice(1, 2).map((node) => ({ node, hook: true }));
  }
  if (!(isTestFunctionName(root) && node.arguments.some(isFunctionNode))) {
    return [];
  }
  return node.arguments.slice(1).flatMap((argument): TimeoutNode[] => {
    if (isFunctionNode(argument)) {
      return [];
    }
    const properties = timeoutProperties(context, argument);
    if (properties.length > 0) {
      return properties.map((property) => ({
        node: property.value,
        hook: HOOK_TIMEOUT_KEYS.includes(property.key.name),
      }));
    }
    const resolved = resolveConstant(context, argument);
    return resolved?.type === AST_NODE_TYPES.ObjectExpression
      ? []
      : [{ node: argument, hook: false }];
  });
}

function reportTimeout(
  context: Context,
  { node: timeout, hook }: TimeoutNode,
  limits: TimeoutLimits,
): void {
  const ceiling = hook ? limits.hookDeclarationCeilingMs : limits.testDeclarationCeilingMs;
  const data = { ceiling: String(ceiling), kind: hook ? 'hook' : 'test' };
  const value = constantNumber(context, timeout);
  if (value === undefined) {
    context.report({ node: timeout, messageId: 'unknownTimeout', data });
    return;
  }
  if (value <= 0 || value > ceiling) {
    const plan = raisedTimeoutFix(context.sourceCode, timeout);
    context.report(
      suggestible(
        { node: timeout, messageId: 'raisedTimeout', data },
        { messageId: 'dropTimeout', plan },
      ),
    );
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    schema: [],
    messages: {
      raisedTimeout:
        'Keep the {{kind}} timeout between 1 and {{ceiling}} ms for this test project. Make the test faster or configure its named project timeout in tools.tests.timeouts.',
      unknownTimeout:
        'Give the {{kind}} timeout as a number between 1 and {{ceiling}} ms written in this file, or keep the default.',
      dropTimeout: 'Remove the timeout and keep the default.',
    },
  },
  create(context) {
    const policy = timeoutPolicy(context.settings);
    const file = path.relative(context.cwd, context.filename).replaceAll('\\', '/');
    const limits = timeoutLimits(policy, file, isIntegrationTestFor(file, policy));
    return {
      CallExpression(node) {
        for (const timeout of timeoutNodes(context, node)) {
          reportTimeout(context, timeout, limits);
        }
      },
    };
  },
};
