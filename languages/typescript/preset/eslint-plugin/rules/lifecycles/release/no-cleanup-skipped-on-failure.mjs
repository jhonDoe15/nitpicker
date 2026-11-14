import {
  firstRelease,
  isCleanupFunction,
  laterStep,
  nearestFunction,
  releaseCall,
} from './cleanup-steps.mjs';
import { unwrapExpression } from '../scope/close-scopes.mjs';

const EXCEPTION_ROUTE =
  ' An exception fits only when a failed release should abort the remaining ones.';
const MAX_NAMED = 3;

function promiseAll(call) {
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    callee.object.name === 'Promise' &&
    callee.property.name === 'all'
  );
}

function mappedRelease(argument) {
  const call = unwrapExpression(argument);
  const callee = call.type === 'CallExpression' ? call.callee : undefined;
  if (callee?.type !== 'MemberExpression' || callee.property.name !== 'map') {
    return false;
  }
  const [callback] = call.arguments;
  const body = callback?.body;
  return body?.type === 'BlockStatement'
    ? body.body.some(
        (statement) =>
          statement.type === 'ReturnStatement' &&
          statement.argument !== null &&
          releaseCall(statement.argument) !== undefined,
      )
    : body !== undefined && releaseCall(body) !== undefined;
}

function releasesAll(call) {
  const [argument] = call.arguments;
  if (argument?.type === 'ArrayExpression') {
    return argument.elements.filter((item) => item !== null && releaseCall(item)).length > 1;
  }
  return argument !== undefined && mappedRelease(argument);
}

function named(steps) {
  const shown = steps.slice(0, MAX_NAMED).join(', ');
  return steps.length > MAX_NAMED ? `${shown} and ${steps.length - MAX_NAMED} more` : shown;
}

function inCleanup(node) {
  const fn = nearestFunction(node);
  return fn !== undefined && isCleanupFunction(fn);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow cleanup that stops at the first failed release, so later releases and the state reset are skipped',
    },
    schema: [],
    messages: {
      sequential: `{{release}} can reject, so {{skipped}} never run. Release with Promise.allSettled and rethrow the first failure, or reset state in try { ... } finally { ... }.${EXCEPTION_ROUTE}`,
      parallel: `Promise.all over releases rejects at the first failure and the other releases are no longer awaited, so their errors are lost. Use Promise.allSettled and rethrow the first failure.${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const { sourceCode } = context;

    return {
      BlockStatement(block) {
        if (!inCleanup(block)) {
          return;
        }
        const index = block.body.findIndex(
          (statement, position) =>
            firstRelease(statement) !== undefined &&
            block.body.slice(position + 1).some((later) => laterStep(sourceCode, later)),
        );
        if (index < 0) {
          return;
        }
        const skipped = block.body
          .slice(index + 1)
          .map((later) => laterStep(sourceCode, later))
          .filter((step) => step !== undefined);
        const first = block.body[index];
        context.report({
          node: first,
          messageId: 'sequential',
          data: {
            release: `${sourceCode.getText(firstRelease(first).callee)}()`,
            skipped: named(skipped),
          },
        });
      },
      CallExpression(node) {
        if (promiseAll(node) && inCleanup(node) && releasesAll(node)) {
          context.report({ node, messageId: 'parallel' });
        }
      },
    };
  },
};
