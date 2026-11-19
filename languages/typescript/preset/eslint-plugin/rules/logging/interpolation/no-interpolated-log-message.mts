import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { readHeadPolicy, type LibraryChoices } from '../../typed/policy-views.mts';
import { unwrapped } from '../../security/security-values.mts';
import { isObjectArgument } from '../argument-kinds.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
import { logReceiver, presentLibraries, presentLogger } from '../logger-calls.mts';

type MessageId = 'structuredFields' | 'trailingFields';

const WINSTON = 'winston';

function staticParts(node: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.TemplateLiteral) {
    return inner.expressions;
  }
  if (inner.type === AST_NODE_TYPES.BinaryExpression && inner.operator === '+') {
    return [inner.left, inner.right];
  }
  return inner.type === AST_NODE_TYPES.Literal ? [] : undefined;
}

function isStatic(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const next of pending) {
    const parts = staticParts(next);
    if (parts === undefined) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}

function isBuilt(node: TSESTree.Node): boolean {
  const inner = unwrapped(node);
  if (inner.type === AST_NODE_TYPES.TemplateLiteral) {
    return !isStatic(inner);
  }
  return (
    inner.type === AST_NODE_TYPES.BinaryExpression && inner.operator === '+' && !isStatic(inner)
  );
}

function isTextual(node: TSESTree.Node): boolean {
  const inner = unwrapped(node);
  return (
    inner.type === AST_NODE_TYPES.TemplateLiteral ||
    (inner.type === AST_NODE_TYPES.Literal && typeof inner.value === 'string') ||
    (inner.type === AST_NODE_TYPES.BinaryExpression && inner.operator === '+')
  );
}

export function noInterpolatedLogMessageRule(
  rootLibraries: LibraryChoices | undefined,
): TSESLint.RuleModule<MessageId> {
  return {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Report pino, bunyan and winston messages built from runtime values',
      },
      schema: [],
      messages: {
        structuredFields: `The {{library}} message is built from runtime values, so every message differs and the values cannot be searched. Pass them as fields and keep the message constant: log.info({ orderId }, 'loaded order').`,
        trailingFields: `The winston message is built from runtime values, so every message differs and the values cannot be searched. Pass them as metadata and keep the message constant: logger.info('loaded order', { orderId }).`,
      },
    },
    create(context) {
      const present = presentLibraries(context, rootLibraries);
      if (present === undefined) {
        return {};
      }
      return {
        CallExpression(node) {
          const logger = presentLogger(context, logReceiver(node), present);
          const [first, second] = node.arguments;
          if (logger === undefined || first === undefined) {
            return;
          }
          const structured =
            logger.library !== WINSTON && (isObjectArgument(context, first) || !isTextual(first));
          const message = structured ? second : first;
          if (
            message === undefined ||
            message.type === AST_NODE_TYPES.SpreadElement ||
            !isBuilt(message)
          ) {
            return;
          }
          context.report({
            node: message,
            messageId: logger.library === WINSTON ? 'trailingFields' : 'structuredFields',
            data: { library: logger.library },
          });
        },
      };
    },
  };
}

export const rule = noInterpolatedLogMessageRule(readHeadPolicy().libraries);
