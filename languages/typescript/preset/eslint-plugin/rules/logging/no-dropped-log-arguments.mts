import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { librariesForFile as untypedLibrariesForFile } from '../../../libraries/file-libraries.mjs';
import { readHeadPolicy, type LibraryChoices } from '../typed/policy-views.mts';
import { type Context, unwrapped } from '../security/security-values.mts';
import { isObjectArgument, isPrimitiveArgument } from './argument-kinds.mts';
import { loggerOf, type Library, type Logger } from './origins/logger-origins.mts';
import { literalText as messageText } from '../analysis/node/call-text.mts';
import { placeholderCount } from './placeholders.mts';

type MessageId = 'droppedValues' | 'missingValues' | 'winstonSplat' | 'winstonExtra';
type RuleContext = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Arguments = readonly TSESTree.CallExpressionArgument[];

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => { readonly logger?: readonly string[] } | undefined = untypedLibrariesForFile;

const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LIBRARIES: readonly Library[] = ['pino', 'bunyan', 'winston'];
const MAX_VALUE_TEXT = 40;

function valuesText(context: RuleContext, values: Arguments): string {
  return values
    .map((value) => {
      const text = context.sourceCode.getText(value);
      return `\`${text.length > MAX_VALUE_TEXT ? `${text.slice(0, MAX_VALUE_TEXT)}...` : text}\``;
    })
    .join(', ');
}

function messageIndex(context: Context, args: Arguments): number | undefined {
  const [first] = args;
  if (first === undefined) {
    return undefined;
  }
  if (messageText(first) !== undefined) {
    return 0;
  }
  return isObjectArgument(context, first) ? 1 : undefined;
}

function reportStructured(context: RuleContext, node: TSESTree.CallExpression, logger: Logger) {
  const index = messageIndex(context, node.arguments);
  const text = index === undefined ? undefined : messageText(node.arguments[index]);
  if (index === undefined || text === undefined) {
    return;
  }
  const placeholders = placeholderCount(text);
  const values = node.arguments.slice(index + 1);
  if (values.length > placeholders && logger.library === 'pino') {
    const dropped = values.slice(placeholders);
    context.report({
      node,
      messageId: 'droppedValues',
      data: { library: logger.library, values: valuesText(context, dropped) },
    });
  } else if (values.length < placeholders) {
    context.report({
      node,
      messageId: 'missingValues',
      data: {
        library: logger.library,
        placeholders: String(placeholders),
        given: String(values.length),
      },
    });
  }
}

function droppedByWinston(context: RuleContext, args: Arguments, placeholders: number): Arguments {
  const [, meta] = args;
  if (placeholders > 0 || meta === undefined) {
    return args.slice(1);
  }
  if (isObjectArgument(context, meta)) {
    return args.slice(2);
  }
  return isPrimitiveArgument(context, meta) ? args.slice(1) : [];
}

function reportWinston(context: RuleContext, node: TSESTree.CallExpression, logger: Logger) {
  const [first] = node.arguments;
  const text = messageText(first);
  if (text === undefined || node.arguments.length < 2 || logger.splat !== 'no') {
    return;
  }
  const placeholders = placeholderCount(text);
  const dropped = droppedByWinston(context, node.arguments, placeholders);
  if (dropped.length > 0) {
    context.report({
      node,
      messageId: placeholders > 0 ? 'winstonSplat' : 'winstonExtra',
      data: { values: valuesText(context, dropped) },
    });
  }
}

function loggerCall(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(node.callee);
  const unspread = node.arguments.every(
    (argument) => argument.type !== AST_NODE_TYPES.SpreadElement,
  );
  return unspread &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    LOG_METHODS.has(callee.property.name)
    ? callee.object
    : undefined;
}

export function noDroppedLogArgumentsRule(
  rootLibraries: LibraryChoices | undefined,
): TSESLint.RuleModule<MessageId> {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Report pino, bunyan and winston calls that drop or leave log arguments',
      },
      schema: [],
      messages: {
        droppedValues: `{{library}} drops {{values}}: no placeholder in the message takes it. Pass the values in the fields object first: log.info({ value }, 'message'), or add a placeholder per value.`,
        missingValues: `The message has {{placeholders}} placeholder(s) but {{given}} value(s) follow it, so {{library}} logs the rest as written. Add a value per placeholder, or remove the placeholder.`,
        winstonSplat: `winston drops {{values}}: it fills % placeholders only when the logger's format includes format.splat(). Add format.splat() to the logger's format, or pass an object as metadata.`,
        winstonExtra: `winston drops {{values}}: only an object after the message is kept, as metadata. Pass the values in an object, or add format.splat() and a placeholder per value.`,
      },
    },
    create(context) {
      const present = new Set(librariesForFile(context, rootLibraries)?.logger ?? []);
      if (!LIBRARIES.some((library) => present.has(library))) {
        return {};
      }
      return {
        CallExpression(node) {
          const receiver = loggerCall(node);
          const logger = receiver === undefined ? undefined : loggerOf(context, receiver);
          if (logger === undefined || !present.has(logger.library)) {
            return;
          }
          if (logger.library === 'winston') {
            reportWinston(context, node, logger);
          } else {
            reportStructured(context, node, logger);
          }
        },
      };
    },
  };
}

export const rule = noDroppedLogArgumentsRule(readHeadPolicy().libraries);
