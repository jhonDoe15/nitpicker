import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';
import { plainName } from '../encoding/plain-names.mts';
import { concatOperands } from './concat-operands.mts';
import { taintOf } from './remote-text.mts';

type MessageId = 'stripControls';

const CONSOLE_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug']);
const LOGGER_NAME = /^(?:logger|log)$/iu;
const TEXT_METHODS = new Set([
  'toString',
  'trim',
  'slice',
  'substring',
  'toLowerCase',
  'toUpperCase',
]);
const NODE_FILE = new RegExp(
  [
    String.raw`\bprocess\.(?:stdout|stderr|argv|exit|env)\b`,
    String.raw`from\s+['"]node:`,
    String.raw`require\(['"](?:node:)?(?:fs|path|child_process|os|util|readline)['"]\)`,
  ].join('|'),
  'u',
);
const BROWSER_FILE = /\bdocument\.|\bwindow\./u;

function isTerminalSink(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee) ?? '';
  const owner = plainName(callee.object) ?? '';
  if (method === 'write') {
    return owner === 'stdout' || owner === 'stderr';
  }
  const bare = callee.object.type === AST_NODE_TYPES.Identifier;
  return CONSOLE_METHODS.has(method) && (owner === 'console' || (bare && LOGGER_NAME.test(owner)));
}

type Carried = { readonly node: TSESTree.Node; readonly stringy: boolean };

function carriedChildren(plain: TSESTree.Node): readonly TSESTree.Node[] | undefined {
  const concatenated = concatOperands(plain);
  if (concatenated !== undefined) {
    return concatenated;
  }
  if (plain.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const callee = unwrapped(plain.callee);
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'String') {
    return plain.arguments;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    TEXT_METHODS.has(memberName(callee) ?? '')
    ? [callee.object]
    : undefined;
}

function carriedValues(node: TSESTree.Node): Carried[] {
  const pending: Carried[] = [{ node, stringy: false }];
  const leaves: Carried[] = [];
  for (const item of pending) {
    const plain = unwrapped(item.node);
    const children = carriedChildren(plain);
    if (children === undefined) {
      leaves.push({ node: plain, stringy: item.stringy });
    } else {
      for (const child of children) {
        pending.push({ node: child, stringy: true });
      }
    }
  }
  return leaves;
}

function isRemote(context: Context, node: TSESTree.Node): boolean {
  return carriedValues(node).some(({ node: value, stringy }) => {
    const taint = taintOf(context, value);
    return (
      taint === 'text' ||
      (taint === 'body' && (stringy || value.type === AST_NODE_TYPES.MemberExpression))
    );
  });
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow printing socket or network text to the terminal without stripping control sequences',
    },
    schema: [],
    messages: {
      stripControls:
        'Text from a socket message or network response can hold ANSI or control sequences that rewrite ' +
        'earlier terminal lines or hide output. Strip them first with `util.stripVTControlCharacters(text)` ' +
        'or print `JSON.stringify(text)`.',
    },
  },
  create(context) {
    const { text } = context.sourceCode;
    if (!NODE_FILE.test(text) || BROWSER_FILE.test(text)) {
      return {};
    }
    return {
      CallExpression(node) {
        if (!isTerminalSink(node)) {
          return;
        }
        for (const argument of node.arguments) {
          if (isRemote(context, argument)) {
            context.report({ node: argument, messageId: 'stripControls' });
          }
        }
      },
    };
  },
};
