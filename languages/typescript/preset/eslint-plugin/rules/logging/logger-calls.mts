import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { librariesForFile as untypedLibrariesForFile } from '../../../libraries/file-libraries.mjs';
import { type LibraryChoices } from '../typed/policy-views.mts';
import { type Context, unwrapped } from '../security/security-values.mts';
import { loggerOf, type Library, type Logger } from './origins/logger-origins.mts';

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => { readonly logger?: readonly string[] } | undefined = untypedLibrariesForFile;

const LOG_METHODS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LIBRARIES: readonly Library[] = ['pino', 'bunyan', 'winston'];

export function presentLibraries(
  context: { readonly filename: string; readonly cwd: string },
  rootLibraries: LibraryChoices | undefined,
): ReadonlySet<string> | undefined {
  const present = new Set(librariesForFile(context, rootLibraries)?.logger ?? []);
  return LIBRARIES.some((library) => present.has(library)) ? present : undefined;
}

export function logReceiver(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const callee = unwrapped(node.callee);
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    LOG_METHODS.has(callee.property.name)
    ? callee.object
    : undefined;
}

export function presentLogger(
  context: Context,
  receiver: TSESTree.Node | undefined,
  present: ReadonlySet<string>,
): Logger | undefined {
  const logger = receiver === undefined ? undefined : loggerOf(context, receiver);
  return logger !== undefined && present.has(logger.library) ? logger : undefined;
}
