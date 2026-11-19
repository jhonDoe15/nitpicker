import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { librariesForFile as untypedLibrariesForFile } from '../../../../libraries/file-libraries.mjs';
import { readHeadPolicy, type LibraryChoices } from '../../typed/policy-views.mts';
import { unwrapped } from '../../security/security-values.mts';
import { isObjectArgument } from '../argument-kinds.mts';
import { loggerOf, type Library } from '../origins/logger-origins.mts';

type MessageId = 'structuredFields' | 'trailingFields';

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => { readonly logger?: readonly string[] } | undefined = untypedLibrariesForFile;

const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const WINSTON: Library = 'winston';
const LIBRARIES: readonly Library[] = ['pino', 'bunyan', WINSTON];

function isStatic(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const next of pending) {
    const inner = unwrapped(next);
    if (inner.type === AST_NODE_TYPES.TemplateLiteral) {
      for (const expression of inner.expressions) {
        pending.push(expression);
      }
    } else if (inner.type === AST_NODE_TYPES.BinaryExpression && inner.operator === '+') {
      pending.push(inner.left, inner.right);
    } else if (inner.type !== AST_NODE_TYPES.Literal) {
      return false;
    }
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

function receiverOf(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(node.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    LOG_METHODS.has(callee.property.name)
    ? callee.object
    : undefined;
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
      const present = new Set(librariesForFile(context, rootLibraries)?.logger ?? []);
      if (!LIBRARIES.some((library) => present.has(library))) {
        return {};
      }
      return {
        CallExpression(node) {
          const receiver = receiverOf(node);
          const logger = receiver === undefined ? undefined : loggerOf(context, receiver);
          const [first, second] = node.arguments;
          if (logger === undefined || !present.has(logger.library) || first === undefined) {
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
