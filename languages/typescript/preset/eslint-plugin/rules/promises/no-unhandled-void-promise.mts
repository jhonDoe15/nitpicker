import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, nameOf } from '../typed/node-views.mts';
import { calleeCannotReject, hasTypeInformation, isThenable } from './cannot-reject.mts';

type Options = readonly [{ readonly runners?: readonly string[] }?];

function isWrapper(
  node: TSESTree.Node,
): node is TSESTree.ChainExpression | TSESTree.TSAsExpression | TSESTree.TSNonNullExpression {
  return (
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

const MESSAGE =
  '`void` discards this promise, so nothing handles its rejection and Node.js exits on an unhandled rejection by default. Await it, or call an async function whose whole body is a `try` with a `catch` that logs and does not rethrow: `void sendReport(id);` with `async function sendReport(id) { try { await report(id); } catch (error) { logger.error({ error }, "report failed"); } }`. A detached-work runner the project already has can be named in nitpicker.config.json under `conventions` as `"typescript.detachedWorkRunners": ["runDetached"]`.';

function unwrapped(node: TSESTree.Node): TSESTree.Node {
  return (
    chainOf(node, (current) => (isWrapper(current) ? current.expression : undefined)).at(-1) ?? node
  );
}

function calleeName(callee: TSESTree.Node): string | undefined {
  const inner = unwrapped(callee);
  if (inner.type === AST_NODE_TYPES.Identifier) {
    return inner.name;
  }
  return inner.type === AST_NODE_TYPES.MemberExpression &&
    !inner.computed &&
    inner.property.type === AST_NODE_TYPES.Identifier
    ? nameOf(inner.property)
    : undefined;
}

export const rule: TSESLint.RuleModule<
  'unhandledVoidPromise',
  Options,
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `void` on a promise whose rejection nothing handles',
      requiresTypeChecking: true,
    },
    schema: [
      {
        type: 'object',
        properties: { runners: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: { unhandledVoidPromise: MESSAGE },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!hasTypeInformation(services)) {
      return {};
    }
    const { esTreeNodeToTSNodeMap, program } = services;
    const checker = program.getTypeChecker();
    const runners = new Set(context.options[0]?.runners ?? []);

    function isHandled(argument: TSESTree.Node): boolean {
      const call = unwrapped(argument);
      if (call.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      return (
        runners.has(calleeName(call.callee) ?? '') ||
        calleeCannotReject(checker, esTreeNodeToTSNodeMap.get(call.callee))
      );
    }

    return {
      "UnaryExpression[operator='void']"(node: TSESTree.UnaryExpression) {
        const target = esTreeNodeToTSNodeMap.get(node.argument);
        if (isThenable(checker, target) && !isHandled(node.argument)) {
          context.report({ node, messageId: 'unhandledVoidPromise' });
        }
      },
    };
  },
};
