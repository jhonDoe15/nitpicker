import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { openRepeat, type Repeat } from '../support/loop-invariance.mts';
import { localFunction, parserVerdict } from './pure-parsers.mts';

const SHARED_FIELDS = new Set([
  'category',
  'code',
  'file',
  'filePath',
  'kind',
  'message',
  'path',
  'rule',
  'ruleId',
  'source',
  'text',
  'title',
  'tool',
  'type',
]);

function sharedField(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  repeat: Repeat,
): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.computed ||
    node.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const name = memberName(node);
  const definition = variableNamed(sourceCode, node.object)?.defs[0];
  return name !== undefined &&
    SHARED_FIELDS.has(name) &&
    definition !== undefined &&
    contains(repeat.node, definition.name)
    ? name
    : undefined;
}

function parseChain(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): { readonly parses: boolean; readonly input: TSESTree.Node } | undefined {
  const fn = localFunction(sourceCode, call.callee);
  const [argument] = call.arguments;
  if (fn === undefined || argument === undefined || call.arguments.length !== 1) {
    return undefined;
  }
  const verdict = parserVerdict(sourceCode, fn);
  if (!verdict.pure) {
    return undefined;
  }
  if (argument.type !== AST_NODE_TYPES.CallExpression) {
    return { parses: verdict.parses, input: argument };
  }
  const inner = parseChain(sourceCode, argument);
  return inner === undefined ? undefined : { ...inner, parses: inner.parses || verdict.parses };
}

function parsedField(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  repeat: Repeat,
): string | undefined {
  const chain = parseChain(sourceCode, call);
  return chain?.parses === true ? sharedField(sourceCode, chain.input, repeat) : undefined;
}

function isOutermost(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const { parent } = call;
  return (
    parent.type !== AST_NODE_TYPES.CallExpression ||
    parent.arguments[0] !== call ||
    parseChain(sourceCode, parent) === undefined
  );
}

export const rule: TSESLint.RuleModule<'parsePerItem'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow parsing the same text field again for every item of a list instead of once per value',
    },
    schema: [],
    messages: {
      parsePerItem:
        '`{{call}}` parses the `{{field}}` of every item again, although items usually share a handful of values of `{{field}}`, and each item keeps its own copy of the result. Parse each distinct value once and share the result: keep a `Map` from the value to its parse for the length of the loop.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        const repeat = openRepeat(call);
        if (repeat === undefined || !isOutermost(sourceCode, call)) {
          return;
        }
        const field = parsedField(sourceCode, call, repeat);
        if (field !== undefined) {
          context.report({
            node: call,
            messageId: 'parsePerItem',
            data: { call: sourceCode.getText(call.callee), field },
          });
        }
      },
    };
  },
};
