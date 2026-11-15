import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { limitedList as untypedLimitedList } from '../../../../../../../shared/messages/format/limited-list.mjs';
import {
  firstRelease,
  isCleanupFunction,
  laterStep,
  nearestFunction,
  releaseCall,
} from './cleanup-steps.mts';
import { isFunctionNode, unwrapExpression } from '../scope/close-scopes.mts';

const EXCEPTION_ROUTE =
  ' An exception fits only when a failed release should abort the remaining ones.';
const limitedList: (items: readonly string[], limit: number) => string = untypedLimitedList;
const MAX_NAMED = 3;

function promiseAll(call: TSESTree.CallExpression): boolean {
  const callee = call.callee;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.object) === 'Promise' &&
    nameOf(callee.property) === 'all'
  );
}

function mappedRelease(argument: TSESTree.Node): boolean {
  const call = unwrapExpression(argument);
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    nameOf(call.callee.property) !== 'map'
  ) {
    return false;
  }
  const [callback] = call.arguments;
  const body = callback !== undefined && isFunctionNode(callback) ? callback.body : undefined;
  return body?.type === AST_NODE_TYPES.BlockStatement
    ? body.body.some(
        (statement) =>
          statement.type === AST_NODE_TYPES.ReturnStatement &&
          statement.argument !== null &&
          releaseCall(statement.argument) !== undefined,
      )
    : body !== undefined && releaseCall(body) !== undefined;
}

function releasesAll(call: TSESTree.CallExpression): boolean {
  const [argument] = call.arguments;
  if (argument?.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      argument.elements.filter((item) => item !== null && releaseCall(item) !== undefined).length >
      1
    );
  }
  return argument !== undefined && mappedRelease(argument);
}

function inCleanup(node: TSESTree.Node): boolean {
  const fn = nearestFunction(node);
  return fn !== undefined && isCleanupFunction(fn);
}

export const rule: TSESLint.RuleModule<'sequential' | 'parallel'> = {
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
      BlockStatement(block: TSESTree.BlockStatement) {
        if (!inCleanup(block)) {
          return;
        }
        const index = block.body.findIndex(
          (statement, position) =>
            firstRelease(statement) !== undefined &&
            block.body.slice(position + 1).some((later) => laterStep(sourceCode, later)),
        );
        const first = block.body[index];
        if (first === undefined) {
          return;
        }
        const release = firstRelease(first);
        if (release === undefined) {
          return;
        }
        const skipped = block.body
          .slice(index + 1)
          .map((later) => laterStep(sourceCode, later))
          .filter((step) => step !== undefined);
        context.report({
          node: first,
          messageId: 'sequential',
          data: {
            release: `${sourceCode.getText(release.callee)}()`,
            skipped: limitedList(skipped, MAX_NAMED),
          },
        });
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (promiseAll(node) && inCleanup(node) && releasesAll(node)) {
          context.report({ node, messageId: 'parallel' });
        }
      },
    };
  },
};
