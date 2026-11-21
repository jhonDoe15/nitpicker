import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  constantNumber,
  isFunctionNode,
  resolveConstant,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import {
  describeSubprocess,
  subprocessBindings,
  withPromisified,
  type ModuleBindings,
} from '../../analysis/subprocess-calls.mts';
import { calleeMethod, promisifiedBinding } from '../process-callees.mts';
import { isAwaited } from '../process-completion.mts';
import { optionsArgument } from '../process-timeout-options.mts';
import { growingCommand } from './growing-commands.mts';
import { outputReads, textParsedWhole, type OutputShape } from './output-uses.mts';
import { literalOption, optionValue, outputIgnored } from './process-options.mts';

type MessageIds = 'growingOutput' | 'sizedParse';
type Limit = { readonly text: string } | undefined;

const UNKNOWN_LIMIT = 'unknown';
const NO_LIMIT = 'none';

const TEXT_CALLS = new Set(['execSync', 'execFileSync']);
const RESULT_CALLS = new Set([
  'spawnSync',
  'execa',
  'execaSync',
  'execaCommand',
  'execaCommandSync',
]);
const CALLBACK_CALLS = new Set(['exec', 'execFile']);
const COMMAND_ONLY = new Set(['execSync', 'exec', 'execaCommand', 'execaCommandSync']);
const EXECA_DEFAULT = '100,000,000 bytes';
const NODE_DEFAULT = '1 MiB (1,048,576 bytes)';

function lastCallback(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const last = call.arguments.at(-1);
  return isFunctionNode(last) ? last : undefined;
}

function shapeOf(
  context: SourceContext,
  call: TSESTree.CallExpression,
  method: string,
): OutputShape | 'callback' | undefined {
  if (TEXT_CALLS.has(method)) {
    return 'text';
  }
  if (CALLBACK_CALLS.has(method)) {
    if (lastCallback(call) !== undefined) {
      return 'callback';
    }
    return isAwaited(context, call) ? 'result' : undefined;
  }
  return RESULT_CALLS.has(method) ? 'result' : undefined;
}

function callbackReads(
  context: SourceContext,
  call: TSESTree.CallExpression,
): { readonly read: boolean; readonly parsed: boolean } {
  const callback = lastCallback(call);
  const output = isFunctionNode(callback) ? callback.params[1] : undefined;
  if (callback === undefined || output?.type !== AST_NODE_TYPES.Identifier) {
    return { read: false, parsed: false };
  }
  const variable = context.sourceCode
    .getDeclaredVariables(callback)
    .find((item) => item.name === output.name);
  const uses = variable?.references.filter((reference) => reference.isRead()) ?? [];
  return {
    read: uses.length > 0,
    parsed: uses.some(({ identifier }) => textParsedWhole(context, identifier)),
  };
}

function limitOf(
  context: SourceContext,
  options: TSESTree.Node | undefined,
): Limit | typeof NO_LIMIT | typeof UNKNOWN_LIMIT {
  const lookup = optionValue(context, options, 'maxBuffer');
  if (!lookup.known) {
    return UNKNOWN_LIMIT;
  }
  if (lookup.value === undefined) {
    return undefined;
  }
  const size = constantNumber(context, resolveConstant(context, lookup.value));
  if (size === undefined || size <= 0) {
    return UNKNOWN_LIMIT;
  }
  return Number.isFinite(size) ? { text: `${size.toLocaleString('en-US')} bytes` } : NO_LIMIT;
}

function defaultLimit(method: string): string {
  return method.startsWith('execa') ? EXECA_DEFAULT : NODE_DEFAULT;
}

function hasSpreadArguments(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  const list = resolveConstant(context, node);
  return (
    list?.type === AST_NODE_TYPES.ArrayExpression &&
    list.elements.some((element) => element?.type === AST_NODE_TYPES.SpreadElement)
  );
}

function unbuffered(context: SourceContext, options: TSESTree.Node | undefined): boolean {
  return outputIgnored(context, options) || literalOption(context, options, 'buffer') === false;
}

function bufferLimit(
  context: SourceContext,
  node: TSESTree.CallExpression,
  method: string,
): ReturnType<typeof limitOf> {
  const options = optionsArgument(context, node, COMMAND_ONLY.has(method));
  return unbuffered(context, options) ? UNKNOWN_LIMIT : limitOf(context, options);
}

function outputGrows(
  context: SourceContext,
  node: TSESTree.CallExpression,
  { method, bindings }: { readonly method: string; readonly bindings: ModuleBindings },
): boolean {
  const subprocess = describeSubprocess(context, node, bindings);
  const [command] = node.arguments;
  const shellText =
    COMMAND_ONLY.has(method) && command !== undefined
      ? context.sourceCode.getText(resolveConstant(context, command) ?? command)
      : undefined;
  return (
    subprocess !== undefined &&
    !hasSpreadArguments(context, subprocess.argsNode) &&
    growingCommand(subprocess, shellText)
  );
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reading output that grows with the project through a fixed-size buffer',
    },
    schema: [],
    messages: {
      growingOutput:
        '{{method}} keeps the whole output of this command in memory, up to {{limit}}, and the output grows with the project (a file listing, a diff, a log). Past the limit the child is killed and the call fails with ENOBUFS, so this works on small projects and fails on the first large one; raising the limit only moves the failure. Read the output as a stream (spawn and read stdout line by line, or pass a file descriptor in stdio), or have the command write to a file and read that.',
      sizedParse:
        '{{method}} has a fixed maxBuffer of {{limit}}, and its whole output is parsed at once, so the limit is a cap on the size of the project. Past it the child is killed and the call fails with ENOBUFS. Read the output as a stream (spawn and read stdout line by line, or pass a file descriptor in stdio), or have the command write its report to a file and read that.',
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = withPromisified(node, subprocessBindings(node));
      },
      VariableDeclarator(node) {
        bindings = promisifiedBinding(node, bindings);
      },
      CallExpression(node) {
        const method = calleeMethod(node.callee, bindings);
        const shape = method === undefined ? undefined : shapeOf(context, node, method);
        if (method === undefined || shape === undefined) {
          return;
        }
        const limit = bufferLimit(context, node, method);
        if (limit === UNKNOWN_LIMIT || limit === NO_LIMIT) {
          return;
        }
        const reads =
          shape === 'callback' ? callbackReads(context, node) : outputReads(context, node, shape);
        if (!reads.read) {
          return;
        }
        const data = { method, limit: limit?.text ?? defaultLimit(method) };
        if (outputGrows(context, node, { method, bindings })) {
          context.report({ node, messageId: 'growingOutput', data });
        } else if (limit !== undefined && reads.parsed) {
          context.report({ node, messageId: 'sizedParse', data });
        }
      },
    };
  },
};
