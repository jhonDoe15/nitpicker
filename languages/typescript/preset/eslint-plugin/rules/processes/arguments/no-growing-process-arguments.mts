import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import { subprocessBindings, type ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { calleeMethod } from '../process-callees.mts';
import { isListing, isPathDelimiter, joinedList, resolvedValue } from './list-sources.mts';

type MessageIds = 'spreadListing' | 'joinedList';

const FILE_FORMS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'fork',
  'execa',
  'execaSync',
  'execaNode',
]);
const SHELL_FORMS = new Set(['exec', 'execSync', 'execaCommand', 'execaCommandSync']);

function argumentNodes(
  context: SourceContext,
  call: TSESTree.CallExpression,
  method: string,
): readonly TSESTree.Node[] {
  const [first, second] = call.arguments;
  if (SHELL_FORMS.has(method)) {
    const command = resolvedValue(context, first);
    return command?.type === AST_NODE_TYPES.TemplateLiteral ? command.expressions : [];
  }
  const list = resolvedValue(context, second);
  return list?.type === AST_NODE_TYPES.ArrayExpression
    ? list.elements.filter((element) => element !== null)
    : [];
}

function problem(context: SourceContext, node: TSESTree.Node): MessageIds | undefined {
  if (node.type === AST_NODE_TYPES.SpreadElement) {
    return isListing(context, node.argument) ? 'spreadListing' : undefined;
  }
  const value = resolvedValue(context, node);
  const joined = value === undefined ? undefined : joinedList(value);
  if (joined === undefined) {
    return undefined;
  }
  const list = resolvedValue(context, joined.list);
  const literal =
    list?.type === AST_NODE_TYPES.ArrayExpression &&
    !list.elements.some(
      (element) =>
        element?.type === AST_NODE_TYPES.SpreadElement && isListing(context, element.argument),
    );
  return (isPathDelimiter(context, joined.separator) && !literal) || isListing(context, joined.list)
    ? 'joinedList'
    : undefined;
}

const FIX =
  'Pass the list another way: an argument file (@args.txt for java, javac, tsc and many tools), standard input, a file-list option (--files-from), the CLASSPATH variable for a class path, or the list cut into chunks.';

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing a list that grows with the project as process arguments',
    },
    schema: [],
    messages: {
      spreadListing: `This spreads a file listing or glob result into the arguments of a child process. The operating system limits the command line (a few MiB on Linux, 32,767 characters on Windows), so the process does not start (E2BIG, "Argument list too long") once the project has enough files. ${FIX}`,
      joinedList: `This joins a list that grows with the project (a class path, a path list, a file listing) into one argument of a child process. Linux limits a single argument to 128 KiB and Windows the whole command line to 32,767 characters, so the process does not start (E2BIG, "Argument list too long") once the project is large enough. ${FIX}`,
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      CallExpression(node) {
        const method = calleeMethod(node.callee, bindings);
        if (method === undefined || !(FILE_FORMS.has(method) || SHELL_FORMS.has(method))) {
          return;
        }
        for (const argument of argumentNodes(context, node, method)) {
          const messageId = problem(context, argument);
          if (messageId !== undefined) {
            context.report({ node: argument, messageId });
          }
        }
      },
    };
  },
};
