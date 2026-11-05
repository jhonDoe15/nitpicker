import { chainOf } from '../analysis/ancestry.mjs';
import { calleeCannotReject, isThenable } from './cannot-reject.mjs';

const WRAPPERS = new Set(['ChainExpression', 'TSAsExpression', 'TSNonNullExpression']);

const MESSAGE =
  '`void` discards this promise, so nothing handles its rejection and Node.js exits on an unhandled rejection by default. Await it, or call an async function whose whole body is a `try` with a `catch` that logs and does not rethrow: `void sendReport(id);` with `async function sendReport(id) { try { await report(id); } catch (error) { logger.error({ error }, "report failed"); } }`. A detached-work runner the project already has can be named in nitpicker.config.json under `conventions` as `"typescript.detachedWorkRunners": ["runDetached"]`.';

function unwrapped(node) {
  return chainOf(node, (current) =>
    WRAPPERS.has(current.type) ? current.expression : undefined,
  ).at(-1);
}

function calleeName(callee) {
  const inner = unwrapped(callee);
  if (inner.type === 'Identifier') {
    return inner.name;
  }
  return inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier'
    ? inner.property.name
    : undefined;
}

export const rule = {
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
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const checker = services.program.getTypeChecker();
    const runners = new Set(context.options[0]?.runners ?? []);

    function isHandled(argument) {
      const call = unwrapped(argument);
      if (call.type !== 'CallExpression') {
        return false;
      }
      return (
        runners.has(calleeName(call.callee)) ||
        calleeCannotReject(checker, services.esTreeNodeToTSNodeMap.get(call.callee))
      );
    }

    return {
      "UnaryExpression[operator='void']"(node) {
        const target = services.esTreeNodeToTSNodeMap.get(node.argument);
        if (isThenable(checker, target) && !isHandled(node.argument)) {
          context.report({ node, messageId: 'unhandledVoidPromise' });
        }
      },
    };
  },
};
